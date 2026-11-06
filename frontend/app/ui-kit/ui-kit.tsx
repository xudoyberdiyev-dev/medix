"use client";

import { Boxes, FileSpreadsheet, Filter, PackagePlus, Ellipsis, Wallet } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge, BADGE_STATUSES, type BadgeStatus } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, KpiCard } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Consequences, Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox, Radio, Switch } from "@/components/ui/selection-controls";
import { Stepper } from "@/components/ui/stepper";
import { ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type SortState, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import type { PageSize } from "@/components/ui/pagination";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";

type Batch = { id: string; product: string; maker: string; batch: string; expires: string; status: BadgeStatus; qty: number; cost: string };

const batches: Batch[] = [
  {
    id: "1",
    product: "Paracetamol 500 mg №20",
    maker: "Nobel Pharmsanoat",
    batch: "PC-24117",
    expires: "2027-03-01",
    status: "valid",
    qty: 1240,
    cost: "1250000.50",
  },
  {
    id: "2",
    product: "Ibuprofen 200 mg №50",
    maker: "Jurabek Laboratories",
    batch: "IB-0931",
    expires: "2026-12-15",
    status: "expiring",
    qty: 86,
    cost: "348200",
  },
  {
    id: "3",
    product: "Amoksitsillin 250 mg",
    maker: "Remedy Group",
    batch: "AM-5520",
    expires: "2026-10-20",
    status: "expired",
    qty: 12,
    cost: "96000",
  },
  {
    id: "4",
    product: "Seftriakson 1 g",
    maker: "Merrymed Farm",
    batch: "SF-7781",
    expires: "2027-08-30",
    status: "reserved",
    qty: 300,
    cost: "2700000",
  },
];

const columns: TableColumn<Batch>[] = [
  {
    key: "product",
    title: "Mahsulot",
    sortable: true,
    render: (r) => (
      <span className="flex flex-col">
        <span>{r.product}</span>
        <span className="text-caption text-text-secondary">{r.maker}</span>
      </span>
    ),
  },
  { key: "batch", title: "Partiya", mono: true },
  { key: "expires", title: "Yaroqlilik muddati", sortable: true, render: (r) => formatDate(new Date(r.expires)) },
  { key: "status", title: "Holat", render: (r) => <Badge status={r.status} /> },
  { key: "qty", title: "Qoldiq", align: "right", sortable: true, render: (r) => formatQuantity(r.qty) },
  { key: "cost", title: "Tannarx, soʻm", align: "right", render: (r) => formatMoney(r.cost) },
];

export function UiKit() {
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("1250000.50");
  const [warehouse, setWarehouse] = useState<string | null>("1");
  const [regions, setRegions] = useState<string[]>(["tsh", "smq"]);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("cash");
  const [sw, setSw] = useState(true);
  const [tab, setTab] = useState("general");
  const [sort, setSort] = useState<SortState>({ key: "product", dir: "asc" });
  const [selected, setSelected] = useState<string[]>(["2"]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState<Batch | null>(null);

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
      <h1 className="text-page-title">Medix komponentlari</h1>

      <Card title="Tugmalar va holatlar">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={PackagePlus}>Kirim yaratish</Button>
          <Button variant="secondary" icon={FileSpreadsheet}>
            Excelga yuklash
          </Button>
          <Button variant="tertiary">Filtrlarni tozalash</Button>
          <Button variant="secondary" loading>
            Saqlash
          </Button>
          <Button disabled>Oʻtkazish</Button>
          <Tooltip content="Qator menyusi">
            <Button variant="icon" size="sm" icon={Ellipsis} aria-label="Qator menyusi" />
          </Tooltip>
          <Button variant="secondary" onClick={() => setModal(true)}>
            Xavfli oynani ochish
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ tone: "success", title: "Kirim tasdiqlandi", description: "BY-TSH-000355 · 24 ta mahsulot" })}
          >
            Bildirishnoma
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(BADGE_STATUSES) as BadgeStatus[]).map((s) => (
            <Badge key={s} status={s} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        <KpiCard
          label="Bugungi savdo, soʻm"
          icon={Wallet}
          value={formatMoney("48250000.00")}
          note="Bugun 16:40 holatiga, Toshkent filiali"
        />
        <KpiCard
          label="Qoldiq"
          icon={Boxes}
          value={formatQuantity(18240)}
          unit="dona"
          note="3 ta partiyaning muddati 30 kun ichida tugaydi"
          tone="warning"
        />
      </div>

      <Card title="Formalar">
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Qidiruv" variant="search" value={search} onChange={setSearch} placeholder="Mahsulot nomi yoki kodi" />
          <TextField label="Summa" variant="amount" suffix="soʻm" value={amount} onChange={setAmount} required />
          <TextField label="Login" value="" onChange={() => undefined} error="Login kiritilmagan. Xodim loginini yozing." required />
          <TextField label="Parol" variant="password" value="secret" onChange={() => undefined} hint="Kamida 8 belgi" />
          <Select
            label="Ombor"
            value={warehouse}
            onChange={setWarehouse}
            options={[
              { value: "1", label: "Markaziy ombor" },
              { value: "2", label: "Samarqand ombori" },
            ]}
          />
          <Select
            label="Hududlar"
            multiple
            value={regions}
            onChange={setRegions}
            options={[
              { value: "tsh", label: "Toshkent" },
              { value: "smq", label: "Samarqand" },
              { value: "bxr", label: "Buxoro" },
            ]}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-6">
          <Checkbox label="Karantindagi partiyalarni koʻrsatish" checked={checked} onChange={setChecked} />
          <Radio label="Naqd" name="pay" value="cash" checked={radio === "cash"} onChange={setRadio} />
          <Radio label="Terminal" name="pay" value="card" checked={radio === "card"} onChange={setRadio} />
          <Switch label="Bildirishnomalar" checked={sw} onChange={setSw} />
        </div>
      </Card>

      <Card>
        <Stepper
          current={2}
          steps={[
            { key: "c", label: "Kompaniya" },
            { key: "b", label: "Filiallar" },
            { key: "w", label: "Omborlar va zonalar" },
            { key: "r", label: "Rollar" },
            { key: "e", label: "Xodimlar" },
          ]}
        />
      </Card>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { key: "general", label: "Umumiy maʼlumot" },
          { key: "batches", label: "Partiyalar", count: 12 },
          { key: "history", label: "Harakatlar tarixi" },
          { key: "x", label: "Narxlar", disabled: true },
        ]}
      />

      <Table
        caption="Partiyalar"
        columns={columns}
        rows={batches}
        rowKey={(r) => r.id}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        bulkActions={
          <Button variant="secondary" size="sm">
            Koʻchirish
          </Button>
        }
        toolbar={
          <>
            <Button variant="secondary" size="sm" icon={Filter}>
              Filtr
            </Button>
            <Button variant="secondary" size="sm" icon={FileSpreadsheet} className="ml-auto">
              Excel
            </Button>
          </>
        }
        sort={sort}
        onSortChange={setSort}
        onRowClick={setDrawer}
        activeKey={drawer?.id}
        rowActions={() => <Button variant="icon" size="sm" icon={Ellipsis} aria-label="Qator menyusi" title="Qator menyusi" />}
        totals={{ qty: formatQuantity(1638), cost: formatMoney("4394200.50") }}
        pagination={{ page, pageSize, total: 1240, onPageChange: setPage, onPageSizeChange: setPageSize }}
      />

      <div className="grid grid-cols-3 gap-4">
        <Card flush>
          <NoResultsState onClearFilters={() => undefined} />
        </Card>
        <Card flush>
          <ForbiddenState />
        </Card>
        <Card flush>
          <ErrorState onRetry={() => undefined} />
        </Card>
      </div>
      <Table caption="Yuklanish" columns={columns.slice(0, 4)} rows={[]} rowKey={(r) => r.id} loading density="compact" />

      <Alert
        tone="warning"
        title="3 ta partiyaning muddati 30 kun ichida tugaydi"
        action={
          <Button variant="secondary" size="sm">
            Partiyalarni koʻrish
          </Button>
        }
      >
        Ularni birinchi navbatda sotishga qoʻying yoki yetkazib beruvchiga qaytaring.
      </Alert>

      <div className="flex items-center gap-2">
        <Avatar name="Dilshod Aliyev" size="sm" />
        <Avatar name="Dilshod Aliyev" />
        <Avatar name="Dilshod Aliyev" size="lg" />
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        tone="danger"
        size="sm"
        title="Kirimni bekor qilasizmi?"
        primaryAction={{ label: "Kirimni bekor qilish", onClick: () => setModal(false) }}
      >
        <p>Bu amalni qaytarib boʻlmaydi.</p>
        <Consequences items={["24 ta mahsulot qoldiqdan ayriladi", `Yetkazib beruvchi qarzi ${formatMoney("12480000")} soʻmga kamayadi`]} />
      </Modal>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        kind="Partiya"
        title={drawer?.product ?? ""}
        subtitle={drawer?.batch}
        status={drawer ? <Badge status={drawer.status} /> : null}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDrawer(null)}>
              Yopish
            </Button>
            <Button>Koʻchirish</Button>
          </>
        }
      >
        <p className="text-text-secondary">Partiya tafsilotlari 4-bosqichda.</p>
      </Drawer>
    </main>
  );
}
