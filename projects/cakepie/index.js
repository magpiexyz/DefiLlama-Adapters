// const ADDRESSES = require('../helper/coreAssets.json')
// const sdk = require('@defillama/sdk')
// const { staking } = require('../helper/staking')
// const PancakePool = require("./abis/pancakeV3Pool.json")
const pancakesdk  = require("@pancakeswap/v3-sdk");
const fetchAllTokenPrice = require('./getTokenPrice.js');
const CakepieReaderAbi = require("./abis/CakepieReader.json");
const config = require("./config")
const _ = require("lodash")

let AllTokenPricCache = null;
const getAllTokenPrice = async () => {
  if (AllTokenPricCache) {
    return AllTokenPricCache;
  }
  AllTokenPricCache = fetchAllTokenPrice();
  return AllTokenPricCache;
};

async function fetchTVLFromSubgraph(
  pancakeStaking,
  poolAddress
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
          first: 1000,
          where: {user_: {address: "${pancakeStaking.toLowerCase()}"}, pool_: {v3Pool: "${poolAddress.toLowerCase()}"},  isStaked: true}
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
    const positionIDList = result.data.userPositions.map(item => {
      return item.id
    })
    if (positionIDList.length > 0) {
      const positionChunkIDList = _.chunk(positionIDList, 100);
      let liquidityList = [];
      for (let m = 0, n = positionChunkIDList.length; m < n; m++) {
        const liquidityListResponse = await fetch(
          `https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: `
              {
                positions (where: { id_in: [${positionChunkIDList[m].join(",")}] }) {
                  liquidity 
                  tickLower {
                    tickIdx
                  } 
                  tickUpper {
                    tickIdx
                  } 
                  pool {
                    id
                  }
                }
              }
            `,
            }),
          }
        );
        const result = await liquidityListResponse.json()
        liquidityList = liquidityList.concat(result.data.positions);
      }

      for (let i = 0, l = liquidityList.length; i < l; i++) {

        const userPosition = liquidityList[i];
        if (Number(userPosition.liquidity) === 0) {
          continue;
        }
        const pos = new pancakesdk.Position({
          pool: pool.v3PoolInfo.v3SDKPool,
          tickLower: Number(userPosition.tickLower.tickIdx),
          tickUpper: Number(userPosition.tickUpper.tickIdx),
          liquidity: ethers.BigNumber.from(userPosition.liquidity).toBigInt(),
        });

        const token0Amount = ethers.utils.parseUnits(
          pos.amount0.toFixed(),
          pool.v3PoolInfo.token0.decimals
        );
        const token1Amount = ethers.utils.parseUnits(
          pos.amount1.toFixed(),
          pool.v3PoolInfo.token0.decimals
        );
        const token0Price =
          TokenPrice[pool.v3PoolInfo.token0.symbol.toUpperCase()];
        const token1Price =
          TokenPrice[pool.v3PoolInfo.token1.symbol.toUpperCase()];
        if (token0Price && token1Price) {
          tvl =
            tvl +
            token0Price *
            Number(
              ethers.utils.formatUnits(
                token0Amount,
                pool.v3PoolInfo.token0.decimals
              )
            ) +
            +token1Price *
            Number(
              ethers.utils.formatUnits(
                token1Amount,
                pool.v3PoolInfo.token1.decimals
              )
            );
        }
      }
    }
  }
  console.log(tvl)
  return tvl;
}

async function getPoolInfo(api, PancakeStaking) {
  let pools = await api.fetchList({ lengthAbi: CakepieReaderAbi.poolLength, itemAbi: CakepieReaderAbi.poolList, target: PancakeStaking })
  for (var i = 0; i < pools.length; i++) {
    await fetchTVLFromSubgraph(PancakeStaking, pools[i])
  }
  return pools
}

async function tvl(timestamp, block, chainBlocks, { api }) {
  console.log("kkkk")
  const { PancakeStaking } = config[api.chain];
  const data = await getPoolInfo(api, PancakeStaking);
  console.log("xxx", data);

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
  // return balances
}

Object.keys(config).forEach((chain) => {
  const { CakepieReader } = config[chain];
  module.exports[chain] = {
    tvl: tvl,
    // staking: staking(CakepieReader)
  }
})