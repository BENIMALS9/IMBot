import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { PersonsPage } from "@/pages/PersonsPage";

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

describe("PersonsPage", () => {
  it("renders page heading", () => {
    renderWithProviders(<PersonsPage />);
    expect(screen.getByText("人物")).toBeInTheDocument();
  });

  it("renders identified persons section", () => {
    renderWithProviders(<PersonsPage />);
    expect(screen.getByText("已识别人物")).toBeInTheDocument();
  });

  it("shows empty state when no persons", () => {
    renderWithProviders(<PersonsPage />);
    expect(screen.getByText("暂无识别人物，上传含有人脸的照片后将自动识别")).toBeInTheDocument();
  });

  it("does not show drag hint initially", () => {
    renderWithProviders(<PersonsPage />);
    expect(screen.queryByText(/拖拽中/)).not.toBeInTheDocument();
  });
});
