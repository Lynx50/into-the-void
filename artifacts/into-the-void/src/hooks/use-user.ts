import { useState, useEffect } from "react";

const USER_ID_KEY = "void_user_id";

export function useUser() {
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      // Generate a simple random string for anonymous identity
      id = "void_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(USER_ID_KEY, id);
    }
    setUserId(id);
  }, []);

  return { userId, isReady: !!userId };
}
