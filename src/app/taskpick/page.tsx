import { Suspense } from "react";
import dynamic from "next/dynamic";

const TaskPickClient = dynamic(() => import("./TaskPickClient"));

export default function TaskPickPage() {
  return (
    <Suspense fallback={<div>Loading TaskPick Page...</div>}>
      <TaskPickClient />
    </Suspense>
  );
}
