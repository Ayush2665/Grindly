import { describe, expect, it } from "vitest";
import { EVENTS, IllegalTransition, STATES, isFinal, transition } from "../src";

describe("contract state machine", () => {
  it("stake mode happy path", () => {
    let s = transition("DRAFT", "SUBMIT");
    s = transition(s, "PAYMENT_CAPTURED");
    s = transition(s, "WINDOW_ENDED");
    expect(s).toBe("SETTLED");
  });
  it("no risk mode needs the friend before payment", () => {
    let s = transition("DRAFT", "SEND_INVITE");
    expect(s).toBe("PENDING_FRIEND");
    s = transition(s, "FRIEND_ACCEPTED");
    expect(s).toBe("AWAITING_PAYMENT");
    expect(transition("PENDING_FRIEND", "INVITE_EXPIRED")).toBe("CANCELLED");
  });
  it("cannot skip payment", () => {
    expect(() => transition("DRAFT", "PAYMENT_CAPTURED")).toThrow(IllegalTransition);
    expect(() => transition("PENDING_FRIEND", "PAYMENT_CAPTURED")).toThrow(IllegalTransition);
  });
  it("cannot cancel once active", () => {
    expect(() => transition("ACTIVE", "PAYMENT_FAILED")).toThrow(IllegalTransition);
    expect(() => transition("ACTIVE", "INVITE_EXPIRED")).toThrow(IllegalTransition);
  });
  it("final states accept nothing", () => {
    for (const s of STATES.filter(isFinal)) for (const e of EVENTS) expect(() => transition(s, e)).toThrow();
  });
});
