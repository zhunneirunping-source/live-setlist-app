import type { Metadata } from "next";
import { SetlistDashboard } from "./SetlistDashboard";

export const metadata: Metadata = {
  title: "Live Setlist App",
  description: "ライブのセットリストと統計をまとめて管理するダッシュボードです。",
  other: {
    "codex-preview": "development",
  },
};

export default function Home() {
  return <SetlistDashboard />;
}
