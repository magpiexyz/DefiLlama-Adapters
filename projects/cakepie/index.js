// const ADDRESSES = require('../helper/coreAssets.json')
// const sdk = require('@defillama/sdk')
// const { staking } = require('../helper/staking')
// const PancakePool = require("./abis/pancakeV3Pool.json")
const pancakesdk = require("@pancakeswap/v3-sdk");
const fetchAllTokenPrice = require('./getTokenPrice.js');
const CakepieReaderAbi = require("./abis/CakepieReader.json");
const config = require("./config")
const _ = require("lodash")

var WETHToken = "";

async function getERC20TokenInfo(api, token) {
  const tokenInfo = { "symbol": "", "decimals": 0 };
  if (token == "0x0000000000000000000000000000000000000000") return tokenInfo;
  tokenInfo.tokenAddress = token;
  if (token == "0x0000000000000000000000000000000000000001") {
    tokenInfo.symbol = "ETH";
    tokenInfo.decimals = 18;
    return tokenInfo;
  }
  tokenInfo.symbol = await api.call({ abi: 'erc20:symbol', target: token })
  tokenInfo.decimals = await api.call({ abi: 'erc20:decimals', target: token })
  return tokenInfo;
}

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

        // const token0 = getERC20TokenInfo(pool)
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

async function getV3PoolInfo(
  api,
  V3poolInfo,
  PancakeStaking,
  masterChefV3,
  pancakeV3Helper
) {
  var cakepiePool = {};
  cakepiePool.poolAddress = V3poolInfo.poolAddress;
  cakepiePool.totalStaked = V3poolInfo.v3Liquidity;
  cakepiePool.helper = pancakeV3Helper;
  cakepiePool.isActive = V3poolInfo.isActive;
  cakepiePool.poolType = V3poolInfo.poolType;
  var v3PoolInfo = {};
  const pid = await api.call({ abi: CakepieReaderAbi.v3PoolAddressPid, target: masterChefV3, params: V3poolInfo.poolAddress })
  var token0;
  var token1;
  var fee;
  var poolInfo = await api.call({ abi: CakepieReaderAbi.poolInfo, target: masterChefV3, params: pid });
  v3PoolInfo.allocPoint = poolInfo.allocPoint
  v3PoolInfo.v3Pool = poolInfo.v3Pool
  token0 = poolInfo.token0
  token1 = poolInfo.token1
  fee = poolInfo.fee
  v3PoolInfo.totalLiquidity = poolInfo.totalLiquidity
  v3PoolInfo.totalBoostLiquidity = poolInfo.totalBoostLiquidity
  v3PoolInfo.token0 = await getERC20TokenInfo(api, token0);
  v3PoolInfo.token1 = await getERC20TokenInfo(api, token1);
  if (v3PoolInfo.token0.tokenAddress == WETHToken) {
      v3PoolInfo.token0.isNative = true;
  }
  if (v3PoolInfo.token1.tokenAddress == WETHToken) {
      v3PoolInfo.token1.isNative = true;
  }
  v3PoolInfo.pid = pid;
  // V3PoolSlot0 memory slot0;
  // (slot0.sqrtPriceX96, slot0.tick, slot0.observationIndex, slot0.observationCardinality, slot0.observationCardinalityNext, slot0.feeProtocol, slot0.unlocked) = IPancakeV3PoolReader(V3poolInfo.poolAddress).slot0();
  // v3PoolInfo.slot0 = slot0;
  // v3PoolInfo.fee = IPancakeV3PoolReader(V3poolInfo.poolAddress).fee();
  // v3PoolInfo.liquidity = IPancakeV3PoolReader(V3poolInfo.poolAddress).liquidity();
  // v3PoolInfo.lmPool = IPancakeV3PoolReader(V3poolInfo.poolAddress).lmPool();
  // v3PoolInfo.lmLiquidity = IPancakeV3LmPoolReader(v3PoolInfo.lmPool).lmLiquidity(); 
  // v3PoolInfo.farmCanBoost = IFarmBoosterReader(v3FARM_BOOSTER).whiteList(pid);
  // cakepiePool.v3PoolInfo = v3PoolInfo;
  // if (PancakeStaking != address(0)) {
  //     cakepiePool.v3AccountInfo = getV3AccountInfo(cakepiePool, PancakeStaking);
  // }
  return cakepiePool;
}

// function getV3AccountInfo(
//   CakepiePool memory pool,
//   address PancakeStaking
// ) public view returns (V3AccountInfo memory) {
//   V3AccountInfo memory v3Info;
//   address token0 = pool.v3PoolInfo.token0.tokenAddress;
//   address token1 = pool.v3PoolInfo.token1.tokenAddress;
//   if (pool.v3PoolInfo.token0.isNative == true) {
//       v3Info.token0Balance = PancakeStaking.balance;
//       v3Info.token0V3HelperAllowance = type(uint256).max;
//   } else {
//       v3Info.token0Balance = IERC20(token0).balanceOf(PancakeStaking);
//       v3Info.token0V3HelperAllowance = IERC20(token0).allowance(PancakeStaking, pool.helper);
//   }
//   if (pool.v3PoolInfo.token1.isNative == true) {
//       v3Info.token1Balance = PancakeStaking.balance;
//       v3Info.token1V3HelperAllowance = type(uint256).max;
//   } else {
//       v3Info.token1Balance = IERC20(token1).balanceOf(PancakeStaking);
//       v3Info.token1V3HelperAllowance = IERC20(token1).allowance(PancakeStaking, pool.helper);
//   }
//   return v3Info;
// }


async function getPoolInfo(api, PancakeStaking, masterChefV3, pancakeV3Helper) {
  let pools = await api.fetchList({ lengthAbi: CakepieReaderAbi.poolLength, itemAbi: CakepieReaderAbi.poolList, target: PancakeStaking })
  let poolsInfo = await api.multiCall({ abi: CakepieReaderAbi.pools, calls: pools, target: PancakeStaking })
  for (var i = 0; i < pools.length; i++) {
    if (poolsInfo[i].poolType == 1) {
      await getV3PoolInfo(api, poolsInfo[i], PancakeStaking, masterChefV3, pancakeV3Helper);
    } else if (poolsInfo[i].poolType == 2 || poolsInfo[i].poolType == 3) {
      await getV2LikePoolInfo(poolsInfo[i], PancakeStaking);
    }
    await fetchTVLFromSubgraph(PancakeStaking, pools[i], poolsInfo[i])
  }
  return pools
}

async function tvl(timestamp, block, chainBlocks, { api }) {
  console.log("kkkk")
  const { PancakeStaking, CakepieReader } = config[api.chain];
  WETHToken = await api.call({ abi: CakepieReaderAbi.weth, target: CakepieReader })
  const masterChefV3 = await api.call({ abi: CakepieReaderAbi.masterChefv3, target: CakepieReader })
  const pancakeV3Helper = await api.call({ abi: CakepieReaderAbi.pancakeV3Helper, target: CakepieReader })
  const data = await getPoolInfo(api, PancakeStaking, masterChefV3, pancakeV3Helper);
  console.log("xxx");

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