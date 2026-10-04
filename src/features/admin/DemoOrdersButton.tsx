import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Alert } from "../../shared/ui/Alert";
import { ActionButton } from "../../shared/ui/ActionButton";
import { useCurrentUser } from "../profile/useCurrentUser";
import { seedKitchenDemo } from "../food/api";

// Dev-only: adds branches (if the restaurant has none) and 12 orders in every
// status/channel/age. Additive -- it never deletes anything.
export function DemoOrdersButton({ restaurantId }: { restaurantId: string }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const customerId = me.data?.data?.itemId;
  const seed = useMutation({
    mutationFn: () => seedKitchenDemo(restaurantId, customerId as string),
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin"] }),
      queryClient.invalidateQueries({ queryKey: ["branches", restaurantId] })
    ])
  });

  return (
    <div className="demo-tools">
      <ActionButton onClick={() => seed.mutate()} disabled={seed.isPending || !customerId} icon={<Sparkles size={16} />}>
        {seed.isPending ? "Adding demo orders..." : "Add demo orders (dev)"}
      </ActionButton>
      {seed.isError ? <Alert tone="error">{(seed.error as Error).message}</Alert> : null}
    </div>
  );
}
