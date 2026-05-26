import "@/styles/globals.css";
import type { AppProps } from "next/app";
import NextApp from "next/app";
import { QueryProvider } from "@/providers/QueryProvider";

export default class App extends NextApp<AppProps> {
  render() {
    const { Component, pageProps } = this.props;

    return (
      <QueryProvider>
        <Component {...pageProps} />
      </QueryProvider>
    );
  }
}
