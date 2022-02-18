import { BigInt } from "@web3api/wasm-as";
import { Big } from "as-big/Big";

import { CURVE_ADDRESS_PROVIDER_ADDRESS } from "../constants";
import { parseStringArray } from "../utils/parseArray";
import {
  env,
  Ethereum_Query,
  Input_getTokenComponents,
  Interface_Token,
  Interface_TokenComponent,
  QueryEnv,
} from "../w3";
import { Token_Query } from "../w3/imported/Token_Query";
import { Token_TokenType } from "../w3/imported/Token_TokenType";

export function getTokenComponents(input: Input_getTokenComponents): Interface_TokenComponent {
  if (env == null) throw new Error("env is not set");
  const connection = (env as QueryEnv).connection;

  const token = Token_Query.getToken({
    address: input.tokenAddress,
    m_type: Token_TokenType.ERC20,
  }).unwrap();

  if (!token) {
    throw new Error(`Token ${input.tokenAddress} is not a valid ERC20 token`);
  }

  const registeryAddressResult = Ethereum_Query.callContractView({
    address: CURVE_ADDRESS_PROVIDER_ADDRESS,
    method: "function get_registry() view returns (address)",
    args: null,
    connection: connection,
  }).unwrap();
  const poolAddress = Ethereum_Query.callContractView({
    address: registeryAddressResult,
    method: "function get_pool_from_lp_token(address) view returns (address)",
    args: [token.address],
    connection: connection,
  }).unwrap();
  const totalCoinsResult = Ethereum_Query.callContractView({
    address: registeryAddressResult,
    method: "function get_n_coins(address) view returns (uint256)",
    args: [poolAddress],
    connection: connection,
  }).unwrap();
  const totalCoins: i32 = I32.parseInt(totalCoinsResult);

  const coinsResult = Ethereum_Query.callContractView({
    address: registeryAddressResult,
    method: "function get_coins(address) view returns (address[8])",
    args: [poolAddress],
    connection: connection,
  }).unwrap();
  const coins: Array<string> = parseStringArray(coinsResult);

  const balancesResult = Ethereum_Query.callContractView({
    address: registeryAddressResult,
    method: "function get_balances(address) view returns (uint256[8])",
    args: [poolAddress],
    connection: connection,
  }).unwrap();
  const balances: Array<string> = parseStringArray(balancesResult);

  const components = new Array<Interface_TokenComponent>(totalCoins);

  const tokenDecimals = BigInt.fromString("10").pow(token.decimals).toString();
  const totalSupply: Big = Big.of(token.totalSupply.toString()) / Big.of(tokenDecimals);

  let unresolvedComponents: i32 = 0;

  for (let i = 0; i < totalCoins; i++) {
    const underlyingTokenAddress: string = coins[i];
    const underlyingToken = changetype<Interface_Token>(
      Token_Query.getToken({
        address: underlyingTokenAddress,
        m_type: Token_TokenType.ERC20,
      }),
    );
    if (!underlyingToken) {
      unresolvedComponents++;
      continue;
    }
    const underlyIngDecimals = BigInt.fromString("10").pow(underlyingToken.decimals).toString();
    const balance: Big = Big.of(balances[i]) / Big.of(underlyIngDecimals);
    const rate = (balance / totalSupply).toString();

    components[i] = {
      tokenAddress: underlyingTokenAddress,
      unresolvedComponents: 0,
      components: [],
      rate: rate,
    };
  }

  return {
    tokenAddress: token.address,
    unresolvedComponents: unresolvedComponents,
    components: components,
    rate: "1",
  };
}
