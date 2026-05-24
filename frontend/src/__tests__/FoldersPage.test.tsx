import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { FoldersPage } from "@/pages/FoldersPage";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FoldersPage", () => {
  it("renders page heading", () => {
    renderWithProviders(<FoldersPage />);
    expect(screen.getByText("文件夹")).toBeInTheDocument();
  });

  it("renders create button", () => {
    renderWithProviders(<FoldersPage />);
    expect(screen.getByText("新建文件夹")).toBeInTheDocument();
  });

  it("shows empty state when no folders", () => {
    renderWithProviders(<FoldersPage />);
    expect(screen.getByText("暂无文件夹，点击「新建文件夹」创建第一个文件夹")).toBeInTheDocument();
  });

  it("does not show create form by default", () => {
    renderWithProviders(<FoldersPage />);
    expect(screen.queryByPlaceholderText("文件夹名称")).not.toBeInTheDocument();
  });
});
