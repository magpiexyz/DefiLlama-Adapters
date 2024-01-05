const ADDRESSES = require('../helper/coreAssets.json')
const sdk = require('@defillama/sdk')
const { staking } = require('../helper/staking')
const PancakePool = require("./abis/pancakeV3Pool.json")
const MasterCakepieAbi = require("./abis/MasterCakepie.json");
const config = require("./config")

async function getPoolList(api, MasterCakepieAddress, MCakeAddress, MCakeSVAddress) {
  let poolTokens = await api.fetchList({ lengthAbi: MasterCakepieAbi.poolLength, itemAbi: MasterCakepieAbi.registeredToken, target: MasterCakepieAddress })
  const customPools = new Set([MCakeAddress, MCakeSVAddress].map(i => i.toLowerCase()))
  poolTokens = poolTokens.filter(i => !customPools.has(i.toLowerCase()))
  const depositTokens = [];
  for(let i=0; i<poolTokens.length; i++){
    depositTokens.push(await api.call({
      abi: PancakePool.token0,
      target: poolTokens[i]
    }))
    depositTokens.push(await api.call({
      abi: PancakePool.token1,
      target: poolTokens[i]
    }))
  };
  return [poolTokens, depositTokens]
}

async function tvl(timestamp, block, chainBlocks, { api }) {
  const { MasterCakepieAddress, MCakeSVAddress, CakeAddress, MCakeAddress } = config[api.chain];
  const [poolTokens, depositTokens] = await getPoolList(api, MasterCakepieAddress, MCakeAddress, MCakeSVAddress);
  console.log(depositTokens)
  const decimals = await api.multiCall({ abi: 'erc20:decimals', calls: depositTokens })
  const balances = {};
  const cakeBal = await api.call({ abi: 'erc20:balanceOf', target: MCakeAddress, params: MasterCakepieAddress })
  sdk.util.sumSingleBalance(balances, CakeAddress, cakeBal, api.chain)
  if (MCakeSVAddress != ADDRESSES.null) {
    const mCakeSVBal = await api.call({ abi: 'erc20:balanceOf', target: MCakeAddress, params: MCakeSVAddress })
    sdk.util.sumSingleBalance(balances, CakeAddress, mCakeSVBal, api.chain)
  }
  const bals = await api.multiCall({ abi: 'erc20:balanceOf', calls: poolTokens.map(i => ({ target: i, params: MasterCakepieAddress })) })
  bals.forEach((v, i) => {
    v /= 10 ** (18 - decimals[i])
    sdk.util.sumSingleBalance(balances, depositTokens[i], v, api.chain)
  })
  return balances
}

Object.keys(config).forEach((chain) => {
  const { CKPAddress } = config[chain];
  module.exports[chain] = {
    tvl: tvl,
    // staking: staking(CKPAddress)
  }
})