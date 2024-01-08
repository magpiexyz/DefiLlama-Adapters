// import { Position } from "@pancakeswap/v3-sdk";
const ADDRESSES = require('../helper/coreAssets.json')
const sdk = require('@defillama/sdk')
const { staking } = require('../helper/staking')
const PancakePool = require("./abis/pancakeV3Pool.json")
const CakepieReaderAbi = require("./abis/CakepieReader.json");
const config = require("./config")

async function getPoolList(api, MasterCakepieAddress, MCakeAddress, MCakeSVAddress, PancakeStaking) {
  let poolTokens = await api.fetchList({ lengthAbi: MasterCakepieAbi.poolLength, itemAbi: MasterCakepieAbi.registeredToken, target: MasterCakepieAddress })
  const customPools = new Set([MCakeAddress, MCakeSVAddress].map(i => i.toLowerCase()))
  poolTokens = poolTokens.filter(i => !customPools.has(i.toLowerCase()))
  const depositTokens = [];
  for (let i = 0; i < poolTokens.length; i++) {
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
  
async function calculatePoolTVL(
  pancakeStaking,
  poolAddress,
  token0,
  token1
) {
  const TokenPrice = await getAllTokenPrice();
  const response = await fetch(
    `https://api.thegraph.com/subgraphs/name/pancakeswap/masterchef-v3-bsc`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
      {
        userPositions(
          where: {user_: {address: "${pancakeStaking.toLowerCase()}"}, pool_: {v3Pool: "${poolAddress.toLowerCase()}"}}
        ) {
          tickLower
          tickUpper
          liquidity
          id
          user {
            address
          }
          pool {
            v3Pool
          }
        }
      }
      `,
      }),
    }
  );
  const result = await response.json();
  let tvl = 0;
  if (result.data && result.data.userPositions) {
    for (let i = 0, l = result.data.userPositions.length; i < l; i++) {

      const userPosition = result.data.userPositions[i];
      if (ethers.BigNumber.from(userPosition.liquidity).isNegative()) {
        continue;
      }
      console.log(pool);
      const pos = new Position({
        pool: pool.v3PoolInfo.v3SDKPool,
        tickLower: +Number(userPosition.tickLower),
        tickUpper: +Number(userPosition.tickUpper),
        liquidity: ethers.BigNumber.from(userPosition.liquidity).toBigInt(),
      });

      const balances = {};
    //   sdk.util.sumSingleBalance(balances, , cakeBal, api.chain)

      // const token0Amount = ethers.utils.parseUnits(
      //   pos.amount0.toFixed(),
      //   pool.v3PoolInfo.token0.decimals
      // );
      // const token1Amount = ethers.utils.parseUnits(
      //   pos.amount1.toFixed(),
      //   pool.v3PoolInfo.token0.decimals
      // );
      // const token0Price =
      //   TokenPrice[pool.v3PoolInfo.token0.symbol.toUpperCase()];
      // const token1Price =
      //   TokenPrice[pool.v3PoolInfo.token1.symbol.toUpperCase()];
      // if (token0Price && token1Price) {
      //   tvl =
      //     tvl +
      //     token0Price *
      //     Number(
      //       ethers.utils.formatUnits(
      //         token0Amount,
      //         pool.v3PoolInfo.token0.decimals
      //       )
      //     ) +
      //     +token1Price *
      //     Number(
      //       ethers.utils.formatUnits(
      //         token1Amount,
      //         pool.v3PoolInfo.token1.decimals
      //       )
      //     );
      // }
    }
  }
  return tvl;
}

async function getPoolInfo(api, CakepieReader) {
    let data = await api.call({
        abi: CakepieReaderAbi.getCakepieInfo,
        target: CakepieReader
      })
      return data
}

async function tvl(timestamp, block, chainBlocks, { api }) {
    const { CakepieReader } = config[api.chain];
    console.log("xxx");
    const data = await getPoolInfo(api, CakepieReader);
    console.log("xxx",data);

//   const [poolTokens, depositTokens] = await getPoolList(api, MasterCakepieAddress, MCakeAddress, MCakeSVAddress, PancakeStaking);
//   console.log(depositTokens)
//   const decimals = await api.multiCall({ abi: 'erc20:decimals', calls: depositTokens })
  const balances = {};
//   const cakeBal = await api.call({ abi: 'erc20:balanceOf', target: MCakeAddress, params: MasterCakepieAddress })
//   sdk.util.sumSingleBalance(balances, CakeAddress, cakeBal, api.chain)
//   if (MCakeSVAddress != ADDRESSES.null) {
//     const mCakeSVBal = await api.call({ abi: 'erc20:balanceOf', target: MCakeAddress, params: MCakeSVAddress })
//     sdk.util.sumSingleBalance(balances, CakeAddress, mCakeSVBal, api.chain)
//   }
//   const bals = await api.multiCall({ abi: 'erc20:balanceOf', calls: poolTokens.map(i => ({ target: i, params: MasterCakepieAddress })) })
//   bals.forEach((v, i) => {
//     v /= 10 ** (18 - decimals[i])
//     sdk.util.sumSingleBalance(balances, depositTokens[i], v, api.chain)
//   })
  return balances
}

Object.keys(config).forEach((chain) => {
  const { CakepieReader } = config[chain];
  module.exports[chain] = {
    tvl: tvl,
    // staking: staking(CakepieReader)
  }
})