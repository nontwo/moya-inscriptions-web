"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

export interface DirectMessageOpenRequest {
  /** Open the conversation with this account (created on the first actual send). */
  readonly userId: string;
  readonly displayName: string;
  readonly token: number;
}

interface DirectMessageEntryValue {
  readonly request: DirectMessageOpenRequest | null;
  readonly openWith: (userId: string, displayName: string) => void;
  readonly consume: (token: number) => void;
}

const DirectMessageEntryContext = createContext<DirectMessageEntryValue | null>(
  null,
);

/**
 * The narrow seam between the accepted AuthorProfile's private-message action
 * and the message-center host: the profile asks to open a conversation, the
 * host consumes the request. Opening never sends a message.
 */
export const DirectMessageEntryProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const [request, setRequest] = useState<DirectMessageOpenRequest | null>(null);
  const sequence = useRef(0);
  const openWith = useCallback((userId: string, displayName: string) => {
    setRequest({ userId, displayName, token: ++sequence.current });
  }, []);
  const consume = useCallback((token: number) => {
    setRequest((current) => (current?.token === token ? null : current));
  }, []);
  const value = useMemo(
    () => ({ request, openWith, consume }),
    [request, openWith, consume],
  );
  return (
    <DirectMessageEntryContext.Provider value={value}>
      {children}
    </DirectMessageEntryContext.Provider>
  );
};

export const useDirectMessageEntry = () =>
  useContext(DirectMessageEntryContext);
