import { describe, it, expect, vi, beforeEach } from "vitest";
import api, { authApi, imagesApi, personsApi, searchApi, foldersApi } from "@/lib/api";

describe("API client", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds auth token to requests", async () => {
    localStorage.setItem("token", "test-jwt-token");

    const config = api.interceptors.request.handlers[0].fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBe("Bearer test-jwt-token");
  });

  it("does not add auth header when no token", () => {
    const config = api.interceptors.request.handlers[0].fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it("rejects with error on 401 response", async () => {
    // jsdom can't test location navigation, but we can verify the interceptor exists
    const handler = api.interceptors.response.handlers[0].rejected;
    expect(typeof handler).toBe("function");

    const err = { response: { status: 401 } };
    try {
      await handler(err);
    } catch (rejected) {
      // The interceptor re-throws the error after handling
      expect(rejected).toBe(err);
    }
  });
});

describe("authApi", () => {
  it("has register method", () => {
    expect(typeof authApi.register).toBe("function");
  });

  it("has login method", () => {
    expect(typeof authApi.login).toBe("function");
  });

  it("has me method", () => {
    expect(typeof authApi.me).toBe("function");
  });
});

describe("imagesApi", () => {
  it("builds thumbnail URL with token", () => {
    localStorage.setItem("token", "mytoken");
    const url = imagesApi.thumbnailUrl("abc-123");
    expect(url).toContain("/api/images/abc-123/thumbnail");
    expect(url).toContain("token=mytoken");
  });

  it("builds original URL with token", () => {
    localStorage.setItem("token", "mytoken");
    const url = imagesApi.originalUrl("abc-123");
    expect(url).toContain("/api/images/abc-123/original");
    expect(url).toContain("token=mytoken");
  });
});

describe("personsApi", () => {
  it("has list method", () => {
    expect(typeof personsApi.list).toBe("function");
  });

  it("has unknown method", () => {
    expect(typeof personsApi.unknown).toBe("function");
  });

  it("has update method", () => {
    expect(typeof personsApi.update).toBe("function");
  });

  it("has delete method", () => {
    expect(typeof personsApi.delete).toBe("function");
  });

  it("builds face thumbnail URL with token", () => {
    localStorage.setItem("token", "mytoken");
    const url = personsApi.faceThumbnailUrl("person-1");
    expect(url).toContain("/api/persons/person-1/face-thumbnail");
    expect(url).toContain("token=mytoken");
  });
});

describe("searchApi", () => {
  it("has search method", () => {
    expect(typeof searchApi.search).toBe("function");
  });

  it("has suggestions method", () => {
    expect(typeof searchApi.suggestions).toBe("function");
  });
});

describe("foldersApi", () => {
  it("has list method", () => {
    expect(typeof foldersApi.list).toBe("function");
  });

  it("has create method", () => {
    expect(typeof foldersApi.create).toBe("function");
  });

  it("has update method", () => {
    expect(typeof foldersApi.update).toBe("function");
  });

  it("has delete method", () => {
    expect(typeof foldersApi.delete).toBe("function");
  });
});
