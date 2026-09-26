import type { HTMLAttributes } from 'react';
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import KartuFoto, { type FotoLokal } from './KartuFoto';

// ⚠️ Berkas ini WAJIB dimuat lewat import() dinamis, JANGAN diimpor statis dari
// TitipJualPage: halaman itu ikut bundle SSR eager, dan @dnd-kit di sana
// menggagalkan check:bundle (SSR_IMPORT_ALLOWLIST) — pola KPRCalculatorClient.

export interface GridFotoSortableProps {
  photos: FotoLokal[];
  onUrutkan: (baru: FotoLokal[]) => void;
  onHapus: (id: string) => void;
  onJadikanUtama: (id: string) => void;
}

// useSortable WAJIB di komponen tersendiri per item (jumlah hook per instance tetap).
function ItemSortable({ foto, utama, onHapus, onJadikanUtama }: {
  foto: FotoLokal; utama: boolean; onHapus: () => void; onJadikanUtama: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: foto.id });
  return (
    <KartuFoto
      src={foto.preview}
      utama={utama}
      onHapus={onHapus}
      onJadikanUtama={onJadikanUtama}
      nodeRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      seretProps={{ ...attributes, ...listeners } as HTMLAttributes<HTMLDivElement>}
      sedangDiseret={isDragging}
    />
  );
}

export default function GridFotoSortable({ photos, onUrutkan, onHapus, onJadikanUtama }: GridFotoSortableProps) {
  // Seluruh kartu bisa diseret (di HP pegangan kecil sulit disentuh), jadi aktivasi
  // WAJIB dibedakan dari ketukan & scroll: mouse perlu bergeser 5px, sentuhan perlu
  // DITAHAN 200ms. Tanpa delay, setiap usapan scroll di atas foto jadi seretan.
  // Ketukan cepat tetap sampai ke tombol ★ / hapus.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const lama = photos.findIndex(p => p.id === active.id);
    const baru = photos.findIndex(p => p.id === over.id);
    if (lama !== -1 && baru !== -1) onUrutkan(arrayMove(photos, lama, baru));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
          {photos.map((f, i) => (
            <ItemSortable
              key={f.id}
              foto={f}
              utama={i === 0}
              onHapus={() => onHapus(f.id)}
              onJadikanUtama={() => onJadikanUtama(f.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
