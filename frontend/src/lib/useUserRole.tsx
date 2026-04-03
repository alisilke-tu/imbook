import { createContext, useContext, useEffect, useState, PropsWithChildren } from "react";
import { FirebaseContext } from "./firebase";
import getRequestClient from "./getRequestClient";

interface UserRoleContextState {
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const UserRoleContext = createContext<UserRoleContextState>({
  isAdmin: false,
  loading: true,
  error: null,
  refetch: async () => {},
});

export function UserRoleProvider({ children }: PropsWithChildren) {
  const { auth, isLoading: authLoading } = useContext(FirebaseContext);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserRole = async () => {
    if (authLoading || !auth?.currentUser) {
      setLoading(false);
      setIsAdmin(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const token = await auth.currentUser.getIdToken();
      const client = getRequestClient(token);
      const response = await client.auth.GetMe();
      setIsAdmin(response.is_admin);
    } catch (err) {
      console.error("Failed to fetch user role:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch user role");
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserRole();
  }, [auth?.currentUser, authLoading]);

  return (
    <UserRoleContext.Provider value={{ isAdmin, loading, error, refetch: fetchUserRole }}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  return useContext(UserRoleContext);
}
