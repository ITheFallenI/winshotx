import { useLayoutEffect, useRef, useState } from "react";
import type { Anotacion, Herramienta } from "../../lib/anotaciones";
import { annotationBounds, hitAnnotation, moveAnnotation, resizeAnnotation, type Point } from "../../lib/annotationGeometry";

/**
 * La capa donde se dibuja encima de la vista previa.
 *
 * Se pinta con SVG y no con un `<canvas>` por una razón concreta: aquí solo hay que
 * ENSEÑAR las marcas mientras se colocan, y quien las dibuja de verdad sobre los píxeles
 * es Rust al exportar. Con SVG cada marca es un elemento que React sabe pintar, mover y
 * borrar solo; con un canvas habría que repintarlo entero a mano en cada movimiento del
 * ratón y llevar la cuenta de lo que hay debajo.
 *
 * **Las coordenadas se guardan de 0 a 1.** La vista previa casi nunca mide lo que va a
 * medir el archivo, así que guardarlas en píxeles obligaría a recalcularlas cada vez que
 * alguien toca «Dimensiones», y una sola que se olvidara dejaría la flecha señalando a
 * otro sitio.
 */
interface Props {
  herramienta: Herramienta | null;
  color: string;
  anotaciones: Anotacion[];
  onAnadir: (anotacion: Anotacion) => void;
  /** Lo que se escribe cuando la herramienta es el texto. */
  texto: string;
  grosorPincel?: number;
  anchoVista?: number;
  aspect?: number;
  seleccionada?: number | null;
  onSeleccionar?: (index: number | null) => void;
  onCambiar?: (index: number, annotation: Anotacion) => void;
  fontSize?: number;
}

export function CapaAnotaciones({ herramienta, color, anotaciones, onAnadir, texto, grosorPincel = 0.006, anchoVista = 1000,
  aspect = 1, seleccionada = null, onSeleccionar, onCambiar, fontSize = 1 / 42 }: Props) {
  const marco = useRef<SVGSVGElement>(null);
  const [dibujando, setDibujando] = useState<Anotacion | null>(null);
  const actual = useRef<Anotacion | null>(null);
  const puntero = useRef<number | null>(null);
  const gesto = useRef<{ index: number; original: Anotacion; start: Point; corner?: string } | null>(null);
  const [edicion, setEdicion] = useState<{ index: number; annotation: Anotacion } | null>(null);
  const ultimaEdicion = useRef<Anotacion | null>(null);
  const actualizar = (marca: Anotacion | null) => {
    actual.current = marca;
    setDibujando(marca);
  };
  useLayoutEffect(() => {
    actual.current = null;
    puntero.current = null;
    setDibujando(null);
    gesto.current = null;
    ultimaEdicion.current = null;
    setEdicion(null);
  }, [herramienta]);

  /** El punto del ratón, en tanto por uno sobre la capa. */
  const punto = (e: React.PointerEvent): [number, number] => {
    const caja = marco.current?.getBoundingClientRect();
    if (!caja || caja.width === 0 || caja.height === 0) return [0, 0];
    return [
      Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width)),
      Math.min(1, Math.max(0, (e.clientY - caja.top) / caja.height)),
    ];
  };

  const empezar = (e: React.PointerEvent) => {
    if (!herramienta || e.button !== 0 || actual.current) return;
    e.preventDefault();
    const [x, y] = punto(e);
    if (herramienta === "select") {
      const caja = marco.current!.getBoundingClientRect();
      const corner = (e.target as SVGElement).dataset.corner;
      let index = corner && seleccionada !== null ? seleccionada : -1;
      if (!corner) for (let i = anotaciones.length - 1; i >= 0; i--) {
        if (hitAnnotation(anotaciones[i], [x, y], caja.width, caja.height)) { index = i; break; }
      }
      onSeleccionar?.(index < 0 ? null : index);
      if (index < 0) return;
      gesto.current = { index, original: anotaciones[index], start: [x, y], corner };
      puntero.current = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    // El texto no se arrastra: se pone donde se pulsa y se acabó.
    if (herramienta === "text") {
      if (texto.trim()) onAnadir({ kind: "text", x1: x, y1: y, x2: x, y2: y, color, text: texto, fontSize });
      return;
    }
    // Y el paso tampoco, y además se numera solo. Numerar a mano es justo lo que se olvida
    // cuando alguien mete un paso en medio, y entonces hay dos treses en la misma imagen.
    if (herramienta === "step") {
      const siguiente = anotaciones.filter((a) => a.kind === "step").length + 1;
      onAnadir({ kind: "step", x1: x, y1: y, x2: x, y2: y, color, text: String(siguiente) });
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    puntero.current = e.pointerId;
    actualizar({ kind: herramienta, x1: x, y1: y, x2: x, y2: y, color, text: "",
      ...(herramienta === "brush" ? { points: [[x, y]], strokeWidth: grosorPincel } : {}) });
  };

  const mover = (e: React.PointerEvent) => {
    const editando = gesto.current;
    if (editando && e.pointerId === puntero.current) {
      const [x, y] = punto(e);
      const { original, start, corner, index } = editando;
      let annotation: Anotacion;
      if (corner) {
        const b = annotationBounds(original, aspect);
        const left = corner.includes("w") ? Math.min(x, b.x + b.width - 0.005) : b.x;
        const top = corner.includes("n") ? Math.min(y, b.y + b.height - 0.005) : b.y;
        const right = corner.includes("e") ? Math.max(x, b.x + 0.005) : b.x + b.width;
        const bottom = corner.includes("s") ? Math.max(y, b.y + 0.005) : b.y + b.height;
        annotation = resizeAnnotation(original, { x: left, y: top, width: right - left, height: bottom - top }, aspect);
      } else annotation = moveAnnotation(original, x - start[0], y - start[1], aspect);
      ultimaEdicion.current = annotation;
      setEdicion({ index, annotation });
      return;
    }
    const marca = actual.current;
    if (!marca || e.pointerId !== puntero.current) return;
    const [x, y] = punto(e);
    if (marca.kind === "brush") {
      const points = marca.points ?? [];
      const ultimo = points.at(-1);
      if (ultimo?.[0] === x && ultimo?.[1] === y) return;
      actualizar({ ...marca, x2: x, y2: y, points: [...points, [x, y]] });
    } else {
      actualizar({ ...marca, x2: x, y2: y });
    }
  };

  const soltar = () => {
    if (gesto.current) {
      if (ultimaEdicion.current) onCambiar?.(gesto.current.index, ultimaEdicion.current);
      gesto.current = null;
      ultimaEdicion.current = null;
      setEdicion(null);
      puntero.current = null;
      return;
    }
    const dibujando = actual.current;
    if (!dibujando) return;
    // Un clic sin arrastre no es una marca, es un clic: sin esto, cada vez que alguien
    // pulsa sin querer queda un rectángulo de cero píxeles imposible de ver y de borrar.
    const ancho = Math.abs(dibujando.x2 - dibujando.x1);
    const alto = Math.abs(dibujando.y2 - dibujando.y1);
    if (dibujando.kind === "brush" || ancho > 0.01 || alto > 0.01) onAnadir(dibujando);
    actualizar(null);
    puntero.current = null;
  };

  const todas = (dibujando ? [...anotaciones, dibujando] : anotaciones)
    .map((a, i) => edicion?.index === i ? edicion.annotation : a);
  const elegida = seleccionada === null ? null : todas[seleccionada];
  const limites = elegida ? annotationBounds(elegida, aspect) : null;

  return (
    <svg
      ref={marco}
      onPointerDown={empezar}
      onPointerMove={mover}
      onPointerUp={(e) => {
        if (e.pointerId !== puntero.current) return;
        if (actual.current?.kind === "brush") mover(e);
        soltar();
      }}
      onPointerCancel={(e) => {
        if (e.pointerId !== puntero.current) return;
        actualizar(null);
        gesto.current = null;
        ultimaEdicion.current = null;
        setEdicion(null);
        puntero.current = null;
      }}
      onPointerLeave={(e) => {
        if (e.pointerId === puntero.current && !e.currentTarget.hasPointerCapture?.(e.pointerId)) soltar();
      }}
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full touch-none ${
        herramienta === "select" ? "cursor-default" : herramienta ? "cursor-crosshair" : "pointer-events-none"
      }`}
    >
      {todas.map((a, i) => (
        <g key={i} pointerEvents="none"><Marca anotacion={a} anchoVista={anchoVista} aspect={aspect} /></g>
      ))}
      {herramienta === "select" && limites && (
        <g data-testid="annotation-selection">
          <rect x={limites.x * 1000} y={limites.y * 1000} width={limites.width * 1000} height={limites.height * 1000}
            fill="none" stroke="#0a9bff" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {elegida?.kind !== "step" && (["nw", "ne", "sw", "se"] as const).map(corner => {
            const x = (limites.x + (corner.includes("e") ? limites.width : 0)) * 1000;
            const y = (limites.y + (corner.includes("s") ? limites.height : 0)) * 1000;
            return <rect key={corner} data-corner={corner} x={x - 5} y={y - 5} width={10} height={10}
              fill="white" stroke="#0a9bff" strokeWidth={1} vectorEffect="non-scaling-stroke"
              style={{ cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize" }} />;
          })}
        </g>
      )}
    </svg>
  );
}

/** Lo que mide el aro de un paso, en el sistema de 1000 del SVG. */
const RADIO_PASO = 38;

/**
 * El centro de una marca de un clic, metido lo justo para que la marca quepa entera.
 *
 * Al exportar se hace lo mismo (`encode::anotacion::centro_metido`), y por la misma razón:
 * un disco partido por el borde no se lee, porque el número se va fuera y lo que queda es
 * una mancha. Aquí hace falta además para que la vista previa enseñe lo que va a salir.
 */
function metido(v: number, radio: number): number {
  return Math.min(1000 - radio, Math.max(radio, v));
}

/** Una marca dibujada, en el sistema de 1000 x 1000 del SVG. */
function Marca({ anotacion: a, anchoVista, aspect }: { anotacion: Anotacion; anchoVista: number; aspect: number }) {
  const [x1, y1, x2, y2] = [a.x1 * 1000, a.y1 * 1000, a.x2 * 1000, a.y2 * 1000];
  const [izq, arr] = [Math.min(x1, x2), Math.min(y1, y2)];
  const [ancho, alto] = [Math.abs(x2 - x1), Math.abs(y2 - y1)];

  switch (a.kind) {
    case "brush": {
      const points = a.points ?? [];
      if (!points.length) return null;
      const d = points.map(([x, y], i) => `${i ? "L" : "M"} ${x * 1000} ${y * 1000}`).join(" ") +
        (points.length === 1 ? " l 0.001 0" : "");
      return <path d={d} fill="none" stroke={a.color} strokeWidth={(a.strokeWidth ?? 0.006) * anchoVista}
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
    }
    case "box":
      return (
        <rect
          x={izq}
          y={arr}
          width={ancho}
          height={alto}
          fill="none"
          stroke={a.color}
          strokeWidth={6}
          vectorEffect="non-scaling-stroke"
        />
      );
    case "highlight":
      return <rect x={izq} y={arr} width={ancho} height={alto} fill={a.color} opacity={0.32} />;
    case "blur":
      // En la vista previa el difuminado se enseña como una zona tramada: el mosaico de
      // verdad lo hace Rust sobre los píxeles, y fingirlo aquí con un filtro daría una
      // idea equivocada de lo que va a salir.
      return (
        <g>
          <rect x={izq} y={arr} width={ancho} height={alto} fill="#0f0f12" opacity={0.82} />
          <rect
            x={izq}
            y={arr}
            width={ancho}
            height={alto}
            fill="none"
            stroke="#ffffff"
            strokeWidth={2}
            strokeDasharray="8 6"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      );
    case "arrow":
      return (
        <g stroke={a.color} strokeWidth={6} fill="none" vectorEffect="non-scaling-stroke">
          <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
          {puntaDeFlecha(x1, y1, x2, y2).map(([px, py], i) => (
            <line
              key={i}
              x1={x2}
              y1={y2}
              x2={px}
              y2={py}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
            />
          ))}
        </g>
      );
    case "text":
      return (
        <text transform={`translate(${x1} ${y1}) scale(1 ${aspect})`} fill={a.color}
          fontSize={(a.fontSize ?? 1 / 42) * 1000} fontFamily="Segoe UI, sans-serif" fontWeight={600} dominantBaseline="hanging">
          {a.text}
        </text>
      );
    case "step": {
      // El disco lleva un aro blanco por fuera, igual que al exportar: sobre una captura
      // oscura un disco de color sin borde se pierde, y sobre una clara se pierde el
      // número. El SVG va estirado a 1000 x 1000, así que el círculo se dibuja con dos
      // radios y sale ovalado si la captura no es cuadrada; al exportar lo pinta Rust
      // redondo, que es lo que cuenta.
      const [cx, cy] = [metido(x1, RADIO_PASO), metido(y1, RADIO_PASO)];
      return (
        <g>
          <ellipse cx={cx} cy={cy} rx={RADIO_PASO} ry={RADIO_PASO} fill="#ffffff" />
          <ellipse cx={cx} cy={cy} rx={32} ry={32} fill={a.color} />
          <text
            x={cx}
            y={cy}
            fill="#ffffff"
            fontSize={38}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {a.text}
          </text>
        </g>
      );
    }
    default:
      return null;
  }
}

/** Los dos extremos de la punta, treinta grados a cada lado de la línea. */
function puntaDeFlecha(x1: number, y1: number, x2: number, y2: number): [number, number][] {
  const angulo = Math.atan2(y2 - y1, x2 - x1);
  const largo = 48;
  return [-0.52, 0.52].map((lado) => {
    const a = angulo + Math.PI + lado;
    return [x2 + Math.cos(a) * largo, y2 + Math.sin(a) * largo] as [number, number];
  });
}
