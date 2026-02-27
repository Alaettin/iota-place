import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IotaClientProvider, WalletProvider } from "@iota/dapp-kit";
import { createNetworkConfig } from "@iota/dapp-kit";
import { getFullnodeUrl } from "@iota/iota-sdk/client";
import "@iota/dapp-kit/dist/index.css";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl("testnet") },
  mainnet: { url: getFullnodeUrl("mainnet") },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <IotaClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </IotaClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
