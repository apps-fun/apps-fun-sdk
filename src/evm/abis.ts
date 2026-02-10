// EVM contract ABIs

// AppsFun contract ABI (factory + AMM)
export const APPS_FUN_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'launchToken',
    outputs: [{ name: 'pair', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'supply', type: 'uint256' },
    ],
    name: 'deployAndLaunch',
    outputs: [
      { name: 'pair', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'supply', type: 'uint256' },
      { name: 'creatorAmount', type: 'uint256' },
    ],
    name: 'deployAndLaunchWithSplit',
    outputs: [
      { name: 'pair', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'getPair',
    outputs: [
      { name: 'pair', type: 'address' },
      { name: 'creator', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'token', type: 'address' },
    ],
    name: 'quoteSwapExactTokensForETH',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'token', type: 'address' },
    ],
    name: 'quoteSwapExactETHForTokens',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactETHForTokens',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForETH',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'canGraduate',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// FeeHolder contract ABI
export const FEE_HOLDER_ABI = [
  {
    inputs: [{ name: 'creator', type: 'address' }],
    name: 'creatorFees',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claimFees',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'claimLPFees',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

// MultiSend contract ABI (for dividends)
export const MULTI_SEND_ABI = [
  {
    inputs: [
      { name: 'app_token', type: 'address' },
      { name: 'distribution_id', type: 'uint256' },
      { name: '_token', type: 'address' },
      { name: '_targets', type: 'address[]' },
      { name: '_amounts', type: 'uint256[]' },
    ],
    name: 'batchSendERC20',
    outputs: [{ name: 'success', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'app_token', type: 'address' },
      { name: 'distribution_id', type: 'uint256' },
      { name: '_targets', type: 'address[]' },
      { name: '_amounts', type: 'uint256[]' },
    ],
    name: 'batchSendEther',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    type: 'event',
    name: 'DistributedETH',
    inputs: [
      { name: 'app_token', type: 'address', indexed: true },
      { name: 'distribution_id', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: false },
      { name: 'eth_amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DistributionETH',
    inputs: [
      { name: 'app_token', type: 'address', indexed: true },
      { name: 'distribution_id', type: 'uint256', indexed: true },
      { name: 'total', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Distribution',
    inputs: [
      { name: 'app_token', type: 'address', indexed: true },
      { name: 'distribution_id', type: 'uint256', indexed: true },
      { name: 'token', type: 'address', indexed: false },
      { name: 'total', type: 'uint256', indexed: false },
    ],
  },
] as const;

// AppsFunToken deployment bytecode (compiled contract)
// Constructor: (string name, string symbol, uint256 supply)
// Mints supply * 10^decimals() to deployer
export const SIMPLE_ERC20_BYTECODE = '0x6080604052346103cc57610a4e80380380610019816103d0565b9283398101906060818303126103cc5780516001600160401b0381116103cc57826100459183016103f5565b60208201519092906001600160401b0381116103cc576040916100699184016103f5565b91015182516001600160401b0381116102d257600354600181811c911680156103c2575b60208210146102b457601f8111610354575b506020601f82116001146102f157819293945f926102e6575b50508160011b915f199060031b1c1916176003555b81516001600160401b0381116102d257600454600181811c911680156102c8575b60208210146102b457601f8111610246575b50602092601f82116001146101e557928192935f926101da575b50508160011b915f199060031b1c1916176004555b670de0b6b3a7640000810290808204670de0b6b3a764000014901517156101b35733156101c7576002548181018091116101b357600255335f525f60205260405f208181540190556040519081525f7fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef60203393a360405161060790816104478239f35b634e487b7160e01b5f52601160045260245ffd5b63ec442f0560e01b5f525f60045260245ffd5b015190505f8061011a565b601f1982169360045f52805f20915f5b86811061022e5750836001959610610216575b505050811b0160045561012f565b01515f1960f88460031b161c191690555f8080610208565b919260206001819286850151815501940192016101f5565b818111156101005760045f52601f820160051c7f8a35acfbc15ff81a39ae7d344fd709f28e8600b4aa8c65c6b64bfe7fe36bd19b602084106102ac575b81601f9101920160051c03905f5b82811061029f575050610100565b5f82820155600101610291565b5f9150610283565b634e487b7160e01b5f52602260045260245ffd5b90607f16906100ee565b634e487b7160e01b5f52604160045260245ffd5b015190505f806100b8565b601f1982169060035f52805f20915f5b81811061033c57509583600195969710610324575b505050811b016003556100cd565b01515f1960f88460031b161c191690555f8080610316565b9192602060018192868b015181550194019201610301565b8181111561009f5760035f52601f820160051c7fc2575a0e9e593c00f959f8c92f12db2869c3395a3b0502d05e2516446f71f85b602084106103ba575b81601f9101920160051c03905f5b8281106103ad57505061009f565b5f8282015560010161039f565b5f9150610391565b90607f169061008d565b5f80fd5b6040519190601f01601f191682016001600160401b038111838210176102d257604052565b81601f820112156103cc578051906001600160401b0382116102d257610424601f8301601f19166020016103d0565b92828452602083830101116103cc57815f9260208093018386015e830101529056fe6080806040526004361015610012575f80fd5b5f3560e01c90816306fdde03146103ef57508063095ea7b31461036d57806318160ddd1461035057806323b872dd14610271578063313ce5671461025657806370a082311461021f57806395d89b4114610104578063a9059cbb146100d35763dd62ed3e1461007f575f80fd5b346100cf5760403660031901126100cf576100986104e8565b6100a06104fe565b6001600160a01b039182165f908152600160209081526040808320949093168252928352819020549051908152f35b5f80fd5b346100cf5760403660031901126100cf576100f96100ef6104e8565b6024359033610514565b602060405160018152f35b346100cf575f3660031901126100cf576040515f6004548060011c90600181168015610215575b602083108114610201578285529081156101e55750600114610190575b50819003601f01601f191681019067ffffffffffffffff82118183101761017c57610178829182604052826104be565b0390f35b634e487b7160e01b5f52604160045260245ffd5b905060045f527f8a35acfbc15ff81a39ae7d344fd709f28e8600b4aa8c65c6b64bfe7fe36bd19b5f905b8282106101cf57506020915082010182610148565b60018160209254838588010152019101906101ba565b90506020925060ff191682840152151560051b82010182610148565b634e487b7160e01b5f52602260045260245ffd5b91607f169161012b565b346100cf5760203660031901126100cf576001600160a01b036102406104e8565b165f525f602052602060405f2054604051908152f35b346100cf575f3660031901126100cf57602060405160128152f35b346100cf5760603660031901126100cf5761028a6104e8565b6102926104fe565b6001600160a01b0382165f818152600160209081526040808320338452909152902054909260443592915f1981106102d0575b506100f99350610514565b83811061033557841561032257331561030f576100f9945f52600160205260405f2060018060a01b0333165f526020528360405f2091039055846102c5565b634a1406b160e11b5f525f60045260245ffd5b63e602df0560e01b5f525f60045260245ffd5b8390637dc7a0d960e11b5f523360045260245260445260645ffd5b346100cf575f3660031901126100cf576020600254604051908152f35b346100cf5760403660031901126100cf576103866104e8565b602435903315610322576001600160a01b031690811561030f57335f52600160205260405f20825f526020528060405f20556040519081527f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b92560203392a3602060405160018152f35b346100cf575f3660031901126100cf575f6003548060011c906001811680156104b4575b602083108114610201578285529081156101e5575060011461045f5750819003601f01601f191681019067ffffffffffffffff82118183101761017c57610178829182604052826104be565b905060035f527fc2575a0e9e593c00f959f8c92f12db2869c3395a3b0502d05e2516446f71f85b5f905b82821061049e57506020915082010182610148565b6001816020925483858801015201910190610489565b91607f1691610413565b602060409281835280519182918282860152018484015e5f828201840152601f01601f1916010190565b600435906001600160a01b03821682036100cf57565b602435906001600160a01b03821682036100cf57565b6001600160a01b03169081156105be576001600160a01b03169182156105ab57815f525f60205260405f205481811061059257817fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef92602092855f525f84520360405f2055845f525f825260405f20818154019055604051908152a3565b8263391434e360e21b5f5260045260245260445260645ffd5b63ec442f0560e01b5f525f60045260245ffd5b634b637e8f60e11b5f525f60045260245ffdfea26469706673582212201a6a3a3237e854b17ceca01ed6af0bdbe39376282039344b36a11c73a3183a0164736f6c63430008210033' as `0x${string}`;

// AppsFunToken ABI (constructor + standard ERC20 for deployment)
export const SIMPLE_ERC20_ABI = [
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'supply', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Standard ERC20 ABI (subset needed for trading)
export const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transferFrom',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;
