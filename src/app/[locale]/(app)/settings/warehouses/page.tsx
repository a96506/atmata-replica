import { type Column } from "@/components/data-table";
import { MasterCrud, type MasterField } from "@/components/master/MasterCrud";
import { listLocations, listWarehouses } from "@/lib/api/master";
import { pageMetadata } from "@/lib/metadata";
import {
  createLocationAction,
  createWarehouseAction,
  deleteLocationAction,
  deleteWarehouseAction,
  updateLocationAction,
  updateWarehouseAction,
} from "@/lib/actions/master";

export const generateMetadata = pageMetadata("nav", "warehouses");

const WAREHOUSE_COLUMNS: Column[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
];

const LOCATION_COLUMNS: Column[] = [
  { key: "warehouse", label: "Warehouse" },
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [warehouses, locations] = await Promise.all([
    listWarehouses(),
    listLocations(),
  ]);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));

  const warehouseFields: MasterField[] = [
    { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. MAIN" },
    { name: "name", label: "Name", type: "text", required: true },
  ];

  const locationFields: MasterField[] = [
    {
      name: "warehouseId",
      label: "Warehouse",
      type: "searchSelect",
      required: true,
      options: warehouses.map((w) => ({
        value: w.id,
        label: `${w.code} · ${w.name}`,
      })),
    },
    { name: "code", label: "Code", type: "text", required: true, placeholder: "e.g. A-01" },
    { name: "name", label: "Name", type: "text", required: true },
  ];

  const warehouseEntities = warehouses.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
  }));

  const locationEntities = locations.map((l) => ({
    id: l.id,
    warehouseId: l.warehouseId,
    code: l.code,
    name: l.name,
  }));

  return (
    <div className="flex flex-col gap-10">
      <MasterCrud
        locale={locale}
        entityLabel="Warehouse"
        title="Warehouses"
        subtitle="Physical storage sites. Admin-only create / edit / delete."
        columns={WAREHOUSE_COLUMNS}
        tableRows={warehouses.map((w) => [w.code, w.name])}
        entities={warehouseEntities}
        fields={warehouseFields}
        onCreate={createWarehouseAction}
        onUpdate={updateWarehouseAction}
        onDelete={deleteWarehouseAction}
        writeOperation="create_warehouse"
      />

      <MasterCrud
        locale={locale}
        entityLabel="Location"
        title="Locations"
        subtitle="Bins and zones inside a warehouse."
        columns={LOCATION_COLUMNS}
        tableRows={locations.map((l) => [
          warehouseById.get(l.warehouseId)?.code ?? l.warehouseId,
          l.code,
          l.name,
        ])}
        entities={locationEntities}
        fields={locationFields}
        onCreate={createLocationAction}
        onUpdate={updateLocationAction}
        onDelete={deleteLocationAction}
        writeOperation="create_location"
      />
    </div>
  );
}
