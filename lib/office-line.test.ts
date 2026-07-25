import { describe, expect, it } from "vitest";
import { officeLine, officeLineShort, officeLineParts } from "./office-line";

describe("officeLine", () => {
  it("collapses the agency when the role already names it", () => {
    expect(officeLine("Secretary of Energy", "Department of Energy")).toBe(
      "Secretary of Energy"
    );
  });

  it("collapses when the role restates the full agency name", () => {
    expect(
      officeLine(
        "Director, Office of Personnel Management",
        "Office of Personnel Management"
      )
    ).toBe("Director, Office of Personnel Management");

    expect(
      officeLine(
        "Director, Office of Science and Technology Policy",
        "Office of Science and Technology Policy"
      )
    ).toBe("Director, Office of Science and Technology Policy");
  });

  it("keeps the agency when a sub-agency role sits inside a department", () => {
    expect(
      officeLine(
        "Administrator, Federal Highway Administration",
        "Department of Transportation"
      )
    ).toBe(
      "Administrator, Federal Highway Administration · Department of Transportation"
    );

    expect(
      officeLine(
        "Administrator, Federal Aviation Administration",
        "Department of Transportation"
      )
    ).toBe(
      "Administrator, Federal Aviation Administration · Department of Transportation"
    );
  });

  it("keeps the agency when the role is a bare generic title", () => {
    expect(
      officeLine("Member", "Council of Economic Advisers")
    ).toBe("Member · Council of Economic Advisers");
  });

  // The trap: "Administrator" must not be treated as a match for an agency
  // ending in "Administration". They are distinct tokens, and NASA carries
  // all the meaning in this row.
  it("does not hide NASA behind the bare role Administrator", () => {
    expect(
      officeLine(
        "Administrator",
        "National Aeronautics and Space Administration"
      )
    ).toBe("Administrator · National Aeronautics and Space Administration");
  });

  it("collapses Navy against the compound Defense agency string", () => {
    // Known, accepted trade-off: "Defense" disappears because the two strings
    // share "navy". Navy implies DoD.
    expect(
      officeLine(
        "Secretary of the Navy",
        "Department of Defense – Department of the Navy"
      )
    ).toBe("Secretary of the Navy");
  });

  it("handles missing values without producing a dangling separator", () => {
    expect(officeLine("Secretary of Commerce", "")).toBe(
      "Secretary of Commerce"
    );
    expect(officeLine("", "Department of Commerce")).toBe(
      "Department of Commerce"
    );
  });

  it("exposes the same decision through officeLineParts", () => {
    expect(officeLineParts("Secretary of Energy", "Department of Energy")).toEqual(
      { role: "Secretary of Energy", agency: null }
    );
    expect(
      officeLineParts("Member", "Council of Economic Advisers")
    ).toEqual({ role: "Member", agency: "Council of Economic Advisers" });
  });
});

describe("officeLineShort", () => {
  it("abbreviates long names inside the role, not just the agency", () => {
    expect(
      officeLineShort(
        "Director, Office of Science and Technology Policy",
        "Office of Science and Technology Policy"
      )
    ).toBe("Director, OSTP");

    expect(
      officeLineShort(
        "Deputy Commissioner, Social Security Administration",
        "Social Security Administration"
      )
    ).toBe("Deputy Commissioner, SSA");
  });

  it("abbreviates the surviving agency half", () => {
    expect(
      officeLineShort(
        "Administrator, Federal Highway Administration",
        "Department of Transportation"
      )
    ).toBe("Administrator, FHWA · DOT");

    expect(
      officeLineShort(
        "Administrator",
        "National Aeronautics and Space Administration"
      )
    ).toBe("Administrator · NASA");

    expect(officeLineShort("Member", "Council of Economic Advisers")).toBe(
      "Member · CEA"
    );
  });

  it("leaves unlisted agencies in full", () => {
    expect(
      officeLineShort("Member", "Board of Governors of the Federal Reserve")
    ).toBe("Member · Board of Governors of the Federal Reserve");
  });
});
