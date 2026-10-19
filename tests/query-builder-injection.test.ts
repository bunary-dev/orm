import { describe, expect, it } from "bun:test";
import { QueryBuilderImpl } from "../src/query-builder.js";

const qb = () => new QueryBuilderImpl("users");

describe("query builder injection protection", () => {
	it("rejects malicious table names", () => {
		expect(() => new QueryBuilderImpl("users; DROP TABLE users")).toThrow();
		expect(() => new QueryBuilderImpl("")).toThrow();
	});

	it("rejects malicious where columns", () => {
		expect(() => qb().where("id = 1 OR 1=1 --", 1)).toThrow();
		expect(() => qb().where("name; DROP TABLE users", "=", "x")).toThrow();
	});

	it("accepts table.col identifiers", () => {
		expect(() => qb().where("users.id", 1)).not.toThrow();
		expect(() => qb().orderBy("users.name", "desc")).not.toThrow();
		expect(() => qb().select("users.id", "name")).not.toThrow();
	});

	it("rejects operators outside the allowlist", () => {
		expect(() => qb().where("id", "= 1 OR 1=1 --", 1)).toThrow();
		expect(() => qb().where("id", "; DROP TABLE users; --", 1)).toThrow();
		for (const op of [
			"=",
			"!=",
			"<>",
			"<",
			"<=",
			">",
			">=",
			"LIKE",
			"not like",
			"IN",
			"IS",
		]) {
			expect(() =>
				qb().where("id", op, op.toUpperCase() === "IN" ? 1 : 1),
			).not.toThrow();
		}
	});

	it("rejects malicious orderBy column and direction", () => {
		expect(() => qb().orderBy("name; DROP TABLE users", "asc")).toThrow();
		expect(() =>
			qb().orderBy("name", "asc; DROP TABLE users" as never),
		).toThrow();
		expect(() => qb().orderBy("name", "sideways" as never)).toThrow();
	});

	it("rejects malicious select columns", () => {
		expect(() => qb().select("id, (SELECT password FROM secrets)")).toThrow();
		expect(() => qb().select("id FROM users; --")).toThrow();
	});

	it("requires limit/offset to be non-negative integers", () => {
		for (const bad of [
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			"1; DROP TABLE users" as never,
			"5" as never,
		]) {
			expect(() => qb().limit(bad)).toThrow();
			expect(() => qb().offset(bad)).toThrow();
		}
		expect(() => qb().limit(0).offset(10)).not.toThrow();
	});
});
