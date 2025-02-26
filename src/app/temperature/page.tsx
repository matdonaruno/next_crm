import { Suspense } from "react";
import dynamic from "next/dynamic";

// dynamic import のオプションから `suspense` を削除
const TemperatureManagementClient = dynamic(() => import("./TemperatureManagementClient"));

export default function TemperaturePage() {
  return (
    <Suspense fallback={<div>Loading Temperature Management...</div>}>
      <TemperatureManagementClient />
    </Suspense>
  );
}
