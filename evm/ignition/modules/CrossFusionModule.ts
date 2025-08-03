import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const CrossFusionModule = buildModule("CrossFusionModule", (m) => {
  // Get deployer account
  const deployer = m.getAccount(0);

  const config = {
    accessToken: deployer,
    owner: deployer,
    rescueDelaySrc: 1 * 24 * 3600, // 1 day
    rescueDelayDst: 1 * 24 * 3600, // 1 day  
    creationFee: "0", 
    treasury: deployer,
    nearConfig: {
      minConfirmations: 1,
      dustThreshold: 546, // Bitcoin dust limit
      maxAmount: 100000000000 // 1000 BTC in satoshis
    }
  };


  // Deploy NearEscrowFactory (specialized for NEAR integration)
  const nearEscrowFactory = m.contract("NearEscrowFactory", [...Object.values(config)], {
    from: deployer,
  });

  return { 
    nearEscrowFactory,
  };
});

export default CrossFusionModule;