import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTypeScriptChaincode } from '../src/scan.js';

const sample = `
import { Context, Contract, Default, Info, Returns, Transaction } from 'fabric-contract-api';

@Default()
@Info({ title: 'AssetTransfer', description: 'Smart contract for assets' })
export class AssetTransferContract extends Contract {

    @Transaction()
    public async CreateAsset(ctx: Context, assetId: string, color: string, size: number, owner: string, appraisedValue: number): Promise<void> {
        const asset = { assetId, color, size, owner, appraisedValue };
        await ctx.stub.putState(assetId, Buffer.from(JSON.stringify(asset)));
    }

    @Transaction(false)
    @Returns('string')
    public async ReadAsset(ctx: Context, assetId: string): Promise<string> {
        const data = await ctx.stub.getState(assetId);
        return data.toString();
    }

    public async helper(ctx: Context): Promise<void> {
        // not exposed — no @Transaction
    }
}
`;

test('parseTypeScriptChaincode extracts contract and methods', () => {
  const contracts = parseTypeScriptChaincode(sample);
  assert.equal(contracts.length, 1);
  const c = contracts[0];
  assert.equal(c.name, 'AssetTransferContract');
  assert.equal(c.default, true);
  assert.equal(c.methods.length, 2);
});

test('submit vs evaluate from @Transaction decorator', () => {
  const [c] = parseTypeScriptChaincode(sample);
  const [create, read] = c.methods;
  assert.equal(create.name, 'CreateAsset');
  assert.equal(create.type, 'submit');
  assert.deepEqual(create.args, ['assetId', 'color', 'size', 'owner', 'appraisedValue']);
  assert.equal(read.name, 'ReadAsset');
  assert.equal(read.type, 'evaluate');
  assert.equal(read.returns, 'string');
  assert.deepEqual(read.args, ['assetId']);
});

test('ctx param is dropped, unmarked helpers are skipped', () => {
  const [c] = parseTypeScriptChaincode(sample);
  const names = c.methods.map((m) => m.name);
  assert.ok(!names.includes('helper'));
  assert.ok(c.methods.every((m) => !m.args.includes('ctx')));
});

test('multi-line @Info does not break parsing', () => {
  const src = `
@Info({
  title: 'X',
  description: 'multi line'
})
@Default()
export class XContract extends Contract {
    @Transaction()
    public async Do(ctx: Context, a: string): Promise<void> {}
}
`;
  const [c] = parseTypeScriptChaincode(src);
  assert.equal(c.name, 'XContract');
  assert.equal(c.default, true);
  assert.deepEqual(
    c.methods.map((m) => m.name),
    ['Do'],
  );
});

test('decorator and method on the same line', () => {
  const src = `
@Default()
export class XContract extends Contract {
    @Transaction() public async Do(ctx: Context, a: string): Promise<void> {}
    @Transaction(false) public async Get(ctx: Context, a: string): Promise<string> { return ''; }
}
`;
  const [c] = parseTypeScriptChaincode(src);
  assert.deepEqual(
    c.methods.map((m) => m.name),
    ['Do', 'Get'],
  );
  assert.equal(c.methods[0].type, 'submit');
  assert.equal(c.methods[1].type, 'evaluate');
});

test('parens inside @Info string literals do not break parsing', () => {
  const src = `
@Info({ title: 'f(x)', description: 'has (parens)' })
@Default()
export class XContract extends Contract {
    @Transaction()
    public async Do(ctx: Context): Promise<void> {}
}
`;
  const [c] = parseTypeScriptChaincode(src);
  assert.equal(c.name, 'XContract');
  assert.deepEqual(
    c.methods.map((m) => m.name),
    ['Do'],
  );
});

test('contracts extending a non-Contract base are found', () => {
  const src = `
export class MyContract extends BaseContract {
    @Transaction()
    public async Resolve(ctx: Context, mspId: string): Promise<string> { return ''; }
}
`;
  const [c] = parseTypeScriptChaincode(src);
  assert.equal(c.name, 'MyContract');
  assert.deepEqual(
    c.methods.map((m) => m.name),
    ['Resolve'],
  );
});

test('classes without @Transaction methods are filtered out', () => {
  const src = `
export class HelperClass {
    public async helper(ctx: Context): Promise<void> {}
}
export class RealContract extends Contract {
    @Transaction()
    public async Do(ctx: Context): Promise<void> {}
}
`;
  const contracts = parseTypeScriptChaincode(src);
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].name, 'RealContract');
});

test('multiple contracts, none default', () => {
  const src = `
export class AContract extends Contract {
    @Transaction()
    public async A(ctx: Context): Promise<void> {}
}
export class BContract extends Contract {
    @Transaction()
    public async B(ctx: Context): Promise<void> {}
}
`;
  const contracts = parseTypeScriptChaincode(src);
  assert.equal(contracts.length, 2);
  assert.ok(contracts.every((c) => c.default === false));
});
