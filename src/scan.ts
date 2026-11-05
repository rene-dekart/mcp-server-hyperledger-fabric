import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Chaincode API scanner.
 *
 * Extracts the contract/method surface of a TypeScript chaincode from its
 * source, so the MCP server can expose it to the model as a resource. The
 * user runs `mcp-server-hyperledger-fabric scan <dir>` once; the generated JSON is served
 * to the model instead of it guessing method names.
 *
 * Parsing is regex-based on the fabric-contract-api decorator conventions:
 *   @Default() / @Info({...})  → contract class
 *   @Transaction()             → submit (write) method
 *   @Transaction(false)        → evaluate (read) method
 *   @Returns('type')           → return type
 * Only methods marked @Transaction are exposed by the chaincode runtime, so
 * unmarked helpers are skipped. ponytail: regex, not a TS parser — covers
 * the standard decorator patterns; exotic signatures may need a hand edit.
 */

export interface ScanMethod {
  name: string;
  args: string[];
  type: 'evaluate' | 'submit';
  returns?: string;
}

export interface ScanContract {
  name: string;
  default: boolean;
  methods: ScanMethod[];
}

export interface ChaincodeApi {
  chaincode: string;
  contracts: ScanContract[];
}

/** Parse one TypeScript chaincode source file into its contracts. */
export function parseTypeScriptChaincode(source: string): ScanContract[] {
  const contracts: ScanContract[] = [];
  let current: ScanContract | null = null;
  let decorators: string[] = [];
  let parenDepth = 0;

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;

    // Continuation of a multi-line decorator (e.g. @Info({ ... })).
    if (parenDepth > 0) {
      decorators.push(line);
      parenDepth += countParens(line);
      continue;
    }

    const isDecorator = line.startsWith('@');
    if (isDecorator) {
      decorators.push(line);
      parenDepth = countParens(line);
      if (parenDepth > 0) continue; // multi-line decorator — wait for continuation
      // else: decorator complete on this line; it may also declare a class or
      // method on the same line (e.g. `@Transaction() public async foo()`).
    }

    // Any base class, not just Contract — contracts often extend a shared
    // base (OwnableMSP, ACorporateAction, ...). Classes without @Transaction
    // methods are filtered out below.
    const classMatch = line.match(/export class (\w+)(?: extends \w+)?/);
    if (classMatch) {
      current = {
        name: classMatch[1],
        default: decorators.some((d) => d.startsWith('@Default')),
        methods: [],
      };
      contracts.push(current);
      decorators = [];
      continue;
    }

    const methodMatch = line.match(/public async (\w+)\(([^)]*)\)/);
    if (methodMatch && current) {
      const tx = decorators.find((d) => d.startsWith('@Transaction'));
      if (tx) {
        // Only @Transaction methods are callable via the gateway.
        const args = methodMatch[2]
          .split(',')
          .map((a) => a.trim())
          .filter((a) => a.length > 0)
          .map((a) => a.split(':')[0].trim())
          .filter((a) => a !== 'ctx'); // context param, not a chaincode arg
        current.methods.push({
          name: methodMatch[1],
          args,
          type: tx.includes('false') ? 'evaluate' : 'submit',
          returns: decorators.find((d) => d.startsWith('@Returns'))?.match(/@Returns\('([^']+)'\)/)?.[1],
        });
      }
      decorators = [];
      continue;
    }

    // Any other code line clears the pending decorator buffer.
    if (!isDecorator) decorators = [];
  }

  // Only contracts with at least one callable method are useful to the model.
  return contracts.filter((c) => c.methods.length > 0);
}

function countParens(line: string): number {
  // Ignore parens inside string literals, e.g. @Info({ title: "f(x)" }).
  const noStrings = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '');
  return (noStrings.match(/\(/g) ?? []).length - (noStrings.match(/\)/g) ?? []).length;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

/** Recursively find non-declaration .ts files under a directory. */
export function findTypeScriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) out.push(...findTypeScriptFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Scan a chaincode source directory into a ChaincodeApi description. */
export function scanChaincode(dir: string, name: string): ChaincodeApi {
  const byName = new Map<string, ScanContract>();
  for (const file of findTypeScriptFiles(dir)) {
    for (const contract of parseTypeScriptChaincode(readFileSync(file, 'utf8'))) {
      if (!byName.has(contract.name)) byName.set(contract.name, contract);
    }
  }
  const contracts = [...byName.values()];
  // A single contract is the default by definition.
  if (contracts.length === 1) contracts[0].default = true;
  return { chaincode: name, contracts };
}

/** CLI entry: mcp-server-hyperledger-fabric scan <dir> [--name <name>] [-o <out>]. */
export async function runScan(argv: string[]): Promise<void> {
  const dir = argv[0];
  if (!dir) {
    console.error('Usage: mcp-server-hyperledger-fabric scan <chaincode-dir> [--name <name>] [-o <output>]');
    process.exit(1);
  }
  const nameFlag = argv.indexOf('--name');
  const name =
    nameFlag !== -1 && argv[nameFlag + 1] && !argv[nameFlag + 1].startsWith('-')
      ? argv[nameFlag + 1]
      : basename(resolve(dir));
  const outFlag = argv.indexOf('-o');
  const outArg =
    outFlag !== -1 && argv[outFlag + 1] && !argv[outFlag + 1].startsWith('-') ? argv[outFlag + 1] : undefined;

  const api = scanChaincode(dir, name);
  // Default: chaincode-api/<name>.json — a git-ignored directory, so scan
  // output never pollutes the chaincode repo. -o <file.json> writes a single
  // file; -o <dir> writes <dir>/<name>.json.
  const out = outArg
    ? outArg.endsWith('.json')
      ? outArg
      : join(outArg, `${name}.json`)
    : join('chaincode-api', `${name}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(api, null, 2)}\n`);
  console.log(`Scanned ${api.contracts.length} contract(s) from ${dir} → ${out}`);
}
