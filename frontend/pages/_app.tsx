import "@/styles/globals.css";
import "@near-wallet-selector/modal-ui/styles.css"
import type { AppProps } from "next/app";
import ContextProvider from "@/context";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ContextProvider cookies={pageProps.cookies}>
      <Component {...pageProps} />
    </ContextProvider>
  );
}
