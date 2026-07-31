import { describe, it, expect } from "vitest";
import { chatRole } from "@/lib/chat-access";

const base = {
  isTeacher: false,
  isEveryone: false,
  chatToken: "secret" as string | null,
  presented: null as string | null,
};

describe("chatRole", () => {
  it("recognises the teacher without a token", () => {
    expect(chatRole({ ...base, isTeacher: true })).toBe("teacher");
  });

  it("recognises a student presenting the right token", () => {
    expect(chatRole({ ...base, presented: "secret" })).toBe("student");
  });

  it("refuses a wrong token", () => {
    expect(chatRole({ ...base, presented: "wrong" })).toBeNull();
  });

  it("refuses no token at all", () => {
    expect(chatRole(base)).toBeNull();
  });

  it("refuses everyone on the everyone group, teacher included", () => {
    expect(chatRole({ ...base, isEveryone: true, isTeacher: true })).toBeNull();
    expect(
      chatRole({ ...base, isEveryone: true, presented: "secret" }),
    ).toBeNull();
  });

  it("refuses when the group has no token, even if one is presented", () => {
    expect(
      chatRole({ ...base, chatToken: null, presented: "secret" }),
    ).toBeNull();
  });

  it("refuses an empty presented token against a null stored token", () => {
    expect(chatRole({ ...base, chatToken: null, presented: null })).toBeNull();
  });

  it("prefers the teacher role when both would match", () => {
    expect(
      chatRole({ ...base, isTeacher: true, presented: "secret" }),
    ).toBe("teacher");
  });
});
