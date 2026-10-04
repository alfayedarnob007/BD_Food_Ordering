import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "../profile/useCurrentUser";
import { listMyAssignments } from "../food/api";
import type { StaffAssignment } from "../food/api";

// The signed-in user's staff assignment, if any. Branch scoping is enforced in
// the portal UI from this record -- see the access note in the README before
// treating it as a server-side guarantee.
export function useStaff(): { assignment?: StaffAssignment; isLoading: boolean; userId?: string } {
  const me = useCurrentUser();
  const userId = me.data?.data?.itemId;
  const query = useQuery({
    enabled: Boolean(userId),
    queryFn: () => listMyAssignments(userId as string),
    queryKey: ["staff", userId]
  });
  return { assignment: query.data?.[0], isLoading: me.isLoading || (Boolean(userId) && query.isLoading), userId };
}
