import { Suspense } from "react";
import { RunView } from "./run-view";

export const metadata = { title: "New run" };

export default function RunPage() {
  return <Suspense><RunView /></Suspense>;
}
