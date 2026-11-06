import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { Modal } from "./modal";
import { Select, filterOptions, type SelectOption } from "./select";
import { Checkbox } from "./selection-controls";
import { Table, type TableColumn } from "./table";
import { Tabs } from "./tabs";
import { pageItems, rangeLabel } from "./pagination";
import { TextField, parseAmount } from "./text-field";
import { DEFAULT_TOAST_DURATION, Toaster, toast, toastStore } from "./toast";
import { initials } from "./avatar";
import { NoResultsState } from "./system-states";

describe("Button", () => {
  it("yuklanishda aria-busy va bosish bloklanadi", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saqlash
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Saqlash" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Badge", () => {
  it("tayyor holat: ikonka + soʻz", () => {
    const { container } = render(<Badge status="expiring" />);
    expect(screen.getByText("Muddati yaqin")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.firstElementChild).toHaveClass("bg-warning-bg", "text-warning");
  });
});

describe("TextField", () => {
  it("summani parse qiladi", () => {
    expect(parseAmount("1.250.000,5")).toBe("1250000.50");
    expect(parseAmount("12")).toBe("12.00");
    expect(parseAmount("-0,5")).toBe("-0.50");
    expect(parseAmount("-0")).toBe("0.00");
    expect(parseAmount("")).toBe("");
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1,234")).toBeNull();
  });

  it("summa maydoni fokusdan chiqqanda formatlanadi", async () => {
    function Wrapper() {
      const [v, setV] = useState("");
      return (
        <>
          <TextField label="Summa" variant="amount" suffix="soʻm" value={v} onChange={setV} />
          <output data-testid="raw">{v}</output>
        </>
      );
    }
    render(<Wrapper />);
    const input = screen.getByLabelText("Summa");
    await userEvent.type(input, "1250000,5");
    await userEvent.tab();
    expect(screen.getByTestId("raw")).toHaveTextContent("1250000.50");
    expect(input).toHaveValue("1.250.000,50");
  });

  it("xato matni maydonga bogʻlanadi", () => {
    render(<TextField label="Login" value="" onChange={() => undefined} error="Login kiritilmagan. Loginni yozing." required />);
    const input = screen.getByRole("textbox", { name: /Login/ });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Login kiritilmagan. Loginni yozing.");
  });

  it("parolni koʻrsatish tugmasi", async () => {
    render(<TextField label="Parol" variant="password" value="x" onChange={() => undefined} />);
    expect(screen.getByLabelText("Parol")).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Parolni koʻrsatish" }));
    expect(screen.getByLabelText("Parol")).toHaveAttribute("type", "text");
  });
});

const warehouses: SelectOption[] = [
  { value: "1", label: "Markaziy ombor", sub: "Toshkent" },
  { value: "2", label: "Samarqand ombori", sub: "Samarqand" },
  { value: "3", label: "Yopilgan ombor", disabled: true },
];

describe("Select", () => {
  it("filtr nom va ikkinchi qator boʻyicha", () => {
    expect(filterOptions(warehouses, "samar").map((o) => o.value)).toEqual(["2"]);
    expect(filterOptions(warehouses, "toshkent").map((o) => o.value)).toEqual(["1"]);
    expect(filterOptions(warehouses, " ")).toHaveLength(3);
  });

  it("klaviatura bilan tanlanadi", async () => {
    const onChange = vi.fn();
    render(<Select label="Ombor" options={warehouses} value={null} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Ombor" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("2");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("qidiruvli: yozish filtrlaydi, oʻchirilgan variant tanlanmaydi", async () => {
    const onChange = vi.fn();
    render(<Select label="Ombor" searchable options={warehouses} value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Ombor" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Qidirish" }), "yopil");
    const opt = screen.getByRole("option", { name: /Yopilgan ombor/ });
    await userEvent.click(opt);
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByRole("textbox", { name: "Qidirish" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Qidirish" }), "zzz");
    expect(screen.getByText(/Hech narsa topilmadi/)).toBeInTheDocument();
  });

  it("koʻp tanlovli", async () => {
    function Wrapper() {
      const [v, setV] = useState<string[]>([]);
      return <Select label="Omborlar" multiple options={warehouses} value={v} onChange={setV} />;
    }
    render(<Wrapper />);
    await userEvent.click(screen.getByRole("combobox", { name: "Omborlar" }));
    await userEvent.click(screen.getByRole("option", { name: /Markaziy/ }));
    await userEvent.click(screen.getByRole("option", { name: /Samarqand/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markaziy ombor — olib tashlash" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Samarqand ombori — olib tashlash" })).toBeInTheDocument();
  });
});

describe("Checkbox", () => {
  it("qisman holat", () => {
    render(<Checkbox checked={false} indeterminate onChange={() => undefined} aria-label="Hammasi" />);
    const box = screen.getByRole("checkbox", { name: "Hammasi" });
    expect((box as HTMLInputElement).indeterminate).toBe(true);
  });
});

type Row = { id: string; name: string; qty: number };
const rows: Row[] = [
  { id: "a", name: "Paracetamol", qty: 1240 },
  { id: "b", name: "Ibuprofen", qty: 12 },
];
const columns: TableColumn<Row>[] = [
  { key: "name", title: "Mahsulot", sortable: true },
  { key: "qty", title: "Qoldiq", align: "right", sortable: true },
];

describe("Table", () => {
  it("saralash, tanlash va ommaviy panel", async () => {
    const onSort = vi.fn();
    function Wrapper() {
      const [sel, setSel] = useState<string[]>([]);
      return (
        <Table
          caption="Mahsulotlar"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          selectable
          selectedKeys={sel}
          onSelectionChange={setSel}
          sort={{ key: "name", dir: "asc" }}
          onSortChange={onSort}
          bulkActions={<Button variant="secondary">Excelga yuklash</Button>}
        />
      );
    }
    render(<Wrapper />);
    expect(screen.getByRole("columnheader", { name: /Mahsulot/ })).toHaveAttribute("aria-sort", "ascending");
    await userEvent.click(screen.getByRole("button", { name: /Mahsulot/ }));
    expect(onSort).toHaveBeenCalledWith({ key: "name", dir: "desc" });
    await userEvent.click(screen.getByRole("button", { name: /Qoldiq/ }));
    expect(onSort).toHaveBeenCalledWith({ key: "qty", dir: "asc" });

    await userEvent.click(screen.getByRole("checkbox", { name: "Sahifadagi barcha qatorlarni tanlash" }));
    expect(screen.getByText("2 ta tanlandi")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tanlovni bekor qilish" }));
    expect(screen.queryByText(/ta tanlandi/)).not.toBeInTheDocument();
  });

  it("Enter qatorni ochadi, ↓ keyingisiga oʻtadi", async () => {
    const onRowClick = vi.fn();
    render(<Table caption="Mahsulotlar" columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />);
    const [, first, second] = screen.getAllByRole("row");
    first.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
  });

  it("yuklanish skeleti va boʻsh holat", () => {
    const { rerender } = render(<Table caption="X" columns={columns} rows={[]} rowKey={(r) => r.id} loading />);
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("row")).toHaveLength(9);
    rerender(<Table caption="X" columns={columns} rows={[]} rowKey={(r) => r.id} emptyState={<NoResultsState />} />);
    expect(screen.getByText("Hech narsa topilmadi")).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  it("sahifa raqamlari qisqaradi", () => {
    expect(pageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(pageItems(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageItems(19, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });

  it("oraliq matni", () => {
    expect(rangeLabel(1, 50, 1240)).toBe("1–50 / 1.240");
    expect(rangeLabel(25, 50, 1240)).toBe("1.201–1.240 / 1.240");
    expect(rangeLabel(1, 50, 37)).toBe("1–37 / 37");
    expect(rangeLabel(1, 50, 0)).toBe("0 / 0");
  });
});

describe("Tabs", () => {
  it("strelkalar bilan almashadi, oʻchirilgan tab oʻtkazib yuboriladi", async () => {
    function Wrapper() {
      const [v, setV] = useState("a");
      return (
        <Tabs
          value={v}
          onChange={setV}
          items={[
            { key: "a", label: "Umumiy" },
            { key: "b", label: "Partiyalar", disabled: true },
            { key: "c", label: "Tarix", count: 12 },
          ]}
        />
      );
    }
    render(<Wrapper />);
    screen.getByRole("tab", { name: "Umumiy" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Tarix/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Tarix/ })).toHaveFocus();
  });
});

describe("Modal", () => {
  it("«Ortga» va asosiy tugma, xavfli tonda danger", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <Modal
        open
        onClose={onClose}
        title="Hujjatni bekor qilasizmi?"
        tone="danger"
        primaryAction={{ label: "Hujjatni bekor qilish", onClick: onConfirm }}
      >
        Bu amalni qaytarib boʻlmaydi.
      </Modal>,
    );
    expect(screen.getByRole("heading", { name: "Hujjatni bekor qilasizmi?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ortga" }));
    expect(onClose).toHaveBeenCalled();
    const primary = screen.getByRole("button", { name: "Hujjatni bekor qilish" });
    expect(primary).toHaveClass("bg-danger");
    await userEvent.click(primary);
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe("Toast", () => {
  afterEach(() => {
    act(() => toastStore.reset());
    vi.useRealTimers();
  });

  it("koʻpi bilan 3 ta, yangisi tepada; muvaffaqiyat 5 soniyada yoʻqoladi, xato qoladi", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast({ tone: "danger", title: "Kirim saqlanmadi" });
      toast({ tone: "success", title: "Bir" });
      toast({ tone: "success", title: "Ikki" });
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Kirim saqlanmadi");
    act(() => {
      toast({ tone: "info", title: "Uch" });
    });
    expect(screen.getAllByRole("status").map((n) => n.textContent)).toEqual(["Uch", "Ikki", "Bir"].map((t) => expect.stringContaining(t)));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => toastStore.reset());
    act(() => {
      toast({ tone: "danger", title: "Xato" });
      toast({ tone: "success", title: "Tayyor" });
    });
    act(() => vi.advanceTimersByTime(DEFAULT_TOAST_DURATION + 10));
    expect(screen.queryByText("Tayyor")).not.toBeInTheDocument();
    expect(screen.getByText("Xato")).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("bosh harflar", () => {
    expect(initials("Dilshod Aliyev")).toBe("DA");
    expect(initials("  Sardor  ")).toBe("S");
    expect(initials("ozod karimov rustamovich")).toBe("OK");
  });
});
