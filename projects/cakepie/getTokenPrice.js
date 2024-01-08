

let AllTokenPricCache = null;

let queryPNPPriceCache = null;
const queryPNPPrice = async () => {
    if (queryPNPPriceCache) {
        return queryPNPPriceCache;
    }
    queryPNPPriceCache = _queryPNPPrice();
    return queryPNPPriceCache;
};
const _queryPNPPrice = async () => {
    try {
        const response = await fetch(
            `https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm-v3`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    query: `{
              token (id: "0x2ac2b254bc18cd4999f64773a966e4f4869c34ee") {
                id
                derivedETH: derivedMatic
              }
            }
                `,
                }),
            }
        );
        const result = await response.json();
        if (
            result &&
            result.data &&
            result.data.token &&
            result.data.token.derivedETH
        ) {
            return Number(result.data.token.derivedETH);
        }
        return 0;
    } catch (error) {
        return 0;
    }
};

const fetchAllPendleAssetsCache = {};
const fetchAllPendleAssets = async (chainId) => {
    if (fetchAllPendleAssetsCache[chainId]) {
        return fetchAllPendleAssetsCache[chainId];
    }
    fetchAllPendleAssetsCache[chainId] = _fetchAllPendleAssets(chainId);
    return fetchAllPendleAssetsCache[chainId];
};

const _fetchAllPendleAssets = async (chainId) => {
    try {
        const result = await fetch(
            `https://api-v2.pendle.finance/core/v1/${chainId}/assets/all`
        );

        const body = await result.json();

        return body;
    } catch (error) {
        return null;
    }
};

const TokenIds =
    "usd,spell-token,frax-share,bob,qi-dao,frax-ether,frax,mimatic,magic-internet-money,overnight-dai,ankr-staked-bnb,ten,staked-frax-ether,pendle,jones-usdc,jones-dao,wrapped-beacon-et,ankreth,ankr,wombat-exchange,magpie-wom,stafi,gains-network,radiant-capital,weth,thena,bitcoin-bep2,wrapped-beacon-eth,ankr-staked-bnb,ankr-staked-eth,stader,stafi-staked-bnb,magpie,lybra-finance,binancecoin,wbnb,silo-finance,pancakeswap-token,alpaca-finance,project-galaxy,first-digital-usd,axlusdc,ageur,xcad-network,venus,ripple,cardano,dogecoin,polkadot,hmx,penpie,mpendle";
let fetchCoingeckoPriceCache = null;
const fetchCoingeckoPrice = async () => {
    if (fetchCoingeckoPriceCache) {
        return fetchCoingeckoPriceCache;
    }
    fetchCoingeckoPriceCache = _fetchCoingeckoPrice();
    return fetchCoingeckoPriceCache;
};
const _fetchCoingeckoPrice = async () => {
    try {
        const reponse = await fetch(
            `https://pro-api.coingecko.com/api/v3/coins/markets?x_cg_pro_api_key=CG-vyY4W8BWWL6Yf3aSsKjejDg3&vs_currency=usd&ids=${TokenIds}`
        );
        const body = await reponse.json();
        if (body.error) {
            return null;
        }
        return body;
    } catch (error) {
        try {
            const reponse = await fetch(
                `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${TokenIds}`
            );
            const body = await reponse.json();
            if (body.error) {
                return null;
            }
            return body;
        } catch (error2) {
            return null;
        }
    }
};


async function fetchAllTokenPrice() {
    const result = await Promise.all([
        queryPNPPrice(),
        fetchAllPendleAssets(42161),
        fetchAllPendleAssets(1),
        fetchCoingeckoPrice(),
    ]);
    const pnpPrice = result[0];
    const assets = result[1];
    const assetsETH = result[2];
    const coingeckoPrice = result[3];

    const AllPrice = {};


    function updateAllPrices(source, target) {
        for (let i = 0, l = source.length; i < l; i++) {
            const asset = source[i];
            const symbol = (asset.simpleSymbol || asset.symbol).toUpperCase();
            target[symbol] = asset.price?.usd;
        }
    }

    updateAllPrices(assets, AllPrice);
    updateAllPrices(assetsETH, AllPrice);
    coingeckoPrice.forEach((data) => {
        AllPrice[data.symbol.toUpperCase()] = data.current_price;
    });

    AllPrice["PNP"] = pnpPrice * AllPrice["ETH"];
    AllPrice["AXL-WSTETH"] = AllPrice["ETH"];

    AllTokenPricCache = AllPrice;

    return AllPrice;
}

module.exports = fetchAllTokenPrice;
