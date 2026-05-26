import type { GetServerSideProps } from "next";
import { Component } from "react";
import { PublicLinkScreen } from "@/components/sharing/PublicLinkScreen";

type Props = {
  token: string;
};

export default class PublicLinkPage extends Component<Props> {
  render() {
    return <PublicLinkScreen token={this.props.token} />;
  }
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => ({
  props: {
    token: String(context.params?.token ?? ""),
  },
});
