export type ContractState = "DRAFT" | "PENDING_FRIEND" | "AWAITING_PAYMENT" | "ACTIVE" | "SETTLED" | "CANCELLED";

export type ContractEvent =
  | "SUBMIT" // stake mode: go to payment
  | "SEND_INVITE" // no risk mode: ask the friend first
  | "FRIEND_ACCEPTED"
  | "INVITE_EXPIRED"
  | "PAYMENT_CAPTURED"
  | "PAYMENT_FAILED"
  | "WINDOW_ENDED";

const TABLE: Record<ContractState, Partial<Record<ContractEvent, ContractState>>> = {
  DRAFT: { SUBMIT: "AWAITING_PAYMENT", SEND_INVITE: "PENDING_FRIEND" },
  PENDING_FRIEND: { FRIEND_ACCEPTED: "AWAITING_PAYMENT", INVITE_EXPIRED: "CANCELLED" },
  AWAITING_PAYMENT: { PAYMENT_CAPTURED: "ACTIVE", PAYMENT_FAILED: "CANCELLED" },
  ACTIVE: { WINDOW_ENDED: "SETTLED" }, // no cancelling once active
  SETTLED: {},
  CANCELLED: {},
};

export class IllegalTransition extends Error {
  constructor(public from: ContractState, public event: ContractEvent) {
    super(`cannot ${event} from ${from}`);
  }
}

export function transition(from: ContractState, event: ContractEvent): ContractState {
  const to = TABLE[from][event];
  if (!to) throw new IllegalTransition(from, event);
  return to;
}

export const STATES = Object.keys(TABLE) as ContractState[];
export const EVENTS: ContractEvent[] = [
  "SUBMIT", "SEND_INVITE", "FRIEND_ACCEPTED", "INVITE_EXPIRED", "PAYMENT_CAPTURED", "PAYMENT_FAILED", "WINDOW_ENDED",
];
export const isFinal = (s: ContractState) => s === "SETTLED" || s === "CANCELLED";
