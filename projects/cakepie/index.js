// const ADDRESSES = require('../helper/coreAssets.json')
// const sdk = require('@defillama/sdk')
// const { staking } = require('../helper/staking')
const ERC20ABI = require("./abis/ERC20.json")
const ethers = require('ethers')
const pancakesdk = require("@pancakeswap/v3-sdk");
const pancakev1Sdk = require("@pancakeswap/sdk");
const fetchAllTokenPrice = require('./getTokenPrice.js');
const CakepieReaderAbi = require("./abis/CakepieReader.json");
const config = require("./config")
const _ = require("lodash")

var WETHToken = "";

async function getERC20TokenInfo(api, token) {
  const tokenInfo = { "tokenAddress":"", "symbol": "", "decimals": 0 };
  if (token == "0x0000000000000000000000000000000000000000") return tokenInfo;
  tokenInfo.tokenAddress = token;
  if (token == "0x0000000000000000000000000000000000000001") {
    tokenInfo.symbol = "ETH";
    tokenInfo.decimals = 18;
    return tokenInfo;
  }
  tokenInfo.symbol = await api.call({ abi: 'erc20:symbol', target: token })
  tokenInfo.decimals = await api.call({ abi: ERC20ABI.decimals, target: token })
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
  pool
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
          where: {user_: {address: "${pancakeStaking.toLowerCase()}"}, pool_: {v3Pool: "${pool.poolAddress.toLowerCase()}"},  isStaked: true}
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
          liquidity: ethers.getBigInt(userPosition.liquidity),
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
  pancakeV3Helper,
  v3FARM_BOOSTER
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
  temptoken0 = await getERC20TokenInfo(api, token0);
  temptoken1 = await getERC20TokenInfo(api, token1);
  const token0Token = new pancakev1Sdk.Token(
    api.chainId,
    token0,
    parseInt(temptoken0.decimals, 10),
    temptoken0.symbol,
    temptoken0.symbol
  );
  const token1Token = new pancakev1Sdk.Token(
    api.chainId,
    token1,
    parseInt(temptoken1.decimals, 10),
    temptoken1.symbol,
    temptoken1.symbol
  );
  v3PoolInfo.token0.tokenAddress = token0Token.address;
  v3PoolInfo.token0.symbol = token0Token.address;
  
  // : itemV3Pool.token0.isNative
  //   ? getNativeToken(this.chainId)
  //   : itemV3Pool.token0.symbol,
  // decimals: itemV3Pool.token0.decimals.toNumber(),
  // isNative: itemV3Pool.token0.isNative,

  v3PoolInfo.token1 = token1Token

  if (v3PoolInfo.token0.tokenAddress == WETHToken) {
    v3PoolInfo.token0.isNative = true;
  }
  if (v3PoolInfo.token1.tokenAddress == WETHToken) {
    v3PoolInfo.token1.isNative = true;
  }
  v3PoolInfo.pid = pid;
  var slot0 = {}
  var slot = await api.call({ abi: CakepieReaderAbi.slot0, target: V3poolInfo.poolAddress });
  slot0.sqrtPriceX96 = slot.sqrtPriceX96
  slot0.tick = slot.tick
  slot0.observationIndex = slot.observationIndex
  slot0.observationCardinality = slot.observationCardinality
  slot0.observationCardinalityNext = slot.observationCardinalityNext
  slot0.feeProtocol = slot.feeProtocol
  slot0.unlocked = slot.unlocked;
  v3PoolInfo.slot0 = slot0;
  v3PoolInfo.fee = await api.call({ abi: CakepieReaderAbi.fee, target: V3poolInfo.poolAddress });
  v3PoolInfo.liquidity = await api.call({ abi: CakepieReaderAbi.liquidity, target: V3poolInfo.poolAddress });
  v3PoolInfo.lmPool = await api.call({ abi: CakepieReaderAbi.lmPool, target: V3poolInfo.poolAddress });
  v3PoolInfo.lmLiquidity = await api.call({ abi: CakepieReaderAbi.lmLiquidity, target: v3PoolInfo.lmPool });
  v3PoolInfo.farmCanBoost = await api.call({ abi: CakepieReaderAbi.whiteList, target: v3FARM_BOOSTER, params: pid });
  cakepiePool.v3PoolInfo = v3PoolInfo;
  cakepiePool.v3AccountInfo = await getV3AccountInfo(api, cakepiePool, PancakeStaking);
  const v3Pool = new Pool(
    token0Token,
    token1Token,
    v3PoolInfo.fee,
    v3PoolInfo.slot0.sqrtPriceX96.toBigInt(),
    v3PoolInfo.liquidity.toBigInt(),
    v3PoolInfo.slot0.tick,
    []
  );
  cakepiePool.v3SDKPool = v3Pool;
  return cakepiePool;
}

async function getV3AccountInfo(
  api,
  pool,
  PancakeStaking
) {
  var v3Info = {};
  var token0 = pool.v3PoolInfo.token0.tokenAddress;
  var token1 = pool.v3PoolInfo.token1.tokenAddress;
  if (pool.v3PoolInfo.token0.isNative == true) {
    v3Info.token0Balance = PancakeStaking.balance;
    v3Info.token0V3HelperAllowance = ethers.MaxUint256;
  } else {
    v3Info.token0Balance = await api.call({ abi: ERC20ABI.balanceOf, target: token0, params: PancakeStaking });
    v3Info.token0V3HelperAllowance = await api.call({ abi: ERC20ABI.allowance, target: token0, params: [PancakeStaking, pool.helper] });
  }
  if (pool.v3PoolInfo.token1.isNative == true) {
    v3Info.token1Balance = PancakeStaking.balance;
    v3Info.token1V3HelperAllowance = ethers.MaxUint256;
  } else {
    v3Info.token1Balance = await api.call({ abi: ERC20ABI.balanceOf, target: token1, params: PancakeStaking });
    v3Info.token1V3HelperAllowance = await api.call({ abi: ERC20ABI.allowance, target: token1, params: [PancakeStaking, pool.helper] });
  }
  return v3Info;
}


async function getPoolInfo(api, PancakeStaking, masterChefV3, pancakeV3Helper, v3FARM_BOOSTER) {
  let poolsAdd = await api.fetchList({ lengthAbi: CakepieReaderAbi.poolLength, itemAbi: CakepieReaderAbi.poolList, target: PancakeStaking })
  let poolsInfo = await api.multiCall({ abi: CakepieReaderAbi.pools, calls: poolsAdd, target: PancakeStaking })
  let pools = [];
  for (var i = 0; i < poolsAdd.length; i++) {
    let pool;
    if (poolsInfo[i].poolType == 1) {
      pool = await getV3PoolInfo(api, poolsInfo[i], PancakeStaking, masterChefV3, pancakeV3Helper, v3FARM_BOOSTER);
    } else if (poolsInfo[i].poolType == 2 || poolsInfo[i].poolType == 3) {
      pool = await getV2LikePoolInfo(poolsInfo[i], PancakeStaking);
    }
    pools.push(pool);
    await fetchTVLFromSubgraph(PancakeStaking, pool)
  }
  return pools
}

async function tvl(timestamp, block, chainBlocks, { api }) {
  const { PancakeStaking, CakepieReader } = config[api.chain];
  WETHToken = await api.call({ abi: CakepieReaderAbi.weth, target: CakepieReader })
  const masterChefV3 = await api.call({ abi: CakepieReaderAbi.masterChefv3, target: CakepieReader })
  const pancakeV3Helper = await api.call({ abi: CakepieReaderAbi.pancakeV3Helper, target: CakepieReader })
  const v3FARM_BOOSTER = await api.call({ abi: CakepieReaderAbi.v3FARM_BOOSTER, target: CakepieReader })
  const data = await getPoolInfo(api, PancakeStaking, masterChefV3, pancakeV3Helper, v3FARM_BOOSTER);
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