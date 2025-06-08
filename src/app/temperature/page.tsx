"use client";
// src/app/temperature/page.tsx

import dynamic from "next/dynamic";
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const TemperatureManagementClient = dynamic(
  () => import("./TemperatureManagementClient"),
  {
    loading: () => <LoadingSpinner message="温度管理ページを読み込み中..." fullScreen />,
  }
);

export default function TemperaturePage() {
  return <TemperatureManagementClient />;
}
