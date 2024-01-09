async function getNativeToken(chainId) {
    const currentChainId = chainId ? chainId : getDefaultNetworkID();
    if (isArbChain(currentChainId)) {
      return "ETH";
    } else if (isETHChain(currentChainId)) {
      return "ETH";
    } else if (isOptChain(currentChainId)) {
      return "ETH";
    } else if (isBSCChain(currentChainId)) {
      return "BNB";
    } else {
      return "ETH";
    }
  };
  
  export const isArbChain = (chainId) => {
    if (
      chainId === networkIds.Arbitrum ||
      chainId === networkIds.ArbitrumLOCAL ||
      chainId === networkIds.ARB_GOERLI
    ) {
      return true;
    } else {
      return false;
    }
  };
  
  export const isOptChain = (chainId) => {
    console.log("running Opt Chain");
    if (
      chainId === networkIds.Optimism ||
      chainId === networkIds.OptimismLOCAL
      // chainId === networkIds.ARB_GOERLI
    ) {
      return true;
    } else {
      return false;
    }
  };
  
  export const isETHChain = (chainId) => {
    if (
      chainId === networkIds.Ethereum ||
      chainId === networkIds.EthereumLOCAL ||
      chainId === networkIds.ETH_GOERLI
    ) {
      return true;
    } else {
      return false;
    }
  };
  
  export const isBSCChain = (chainId) => {
    if (
      chainId === networkIds.BSCMain ||
      chainId === networkIds.LOCAL ||
      chainId === networkIds.BSCTestnet
    ) {
      return true;
    } else {
      return false;
    }
  };
  
module.exports = getNativeToken;
