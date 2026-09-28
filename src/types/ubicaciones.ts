export interface Hueco {
  id: string;
  codigo: string;
  capacidad: number | null;
  activo: boolean;
  notas: string | null;
}

export interface Nivel {
  id: string;
  codigo: string;
  orden: number;
  huecos: Hueco[];
}

export interface Estanteria {
  id: string;
  codigo: string;
  descripcion: string | null;
  niveles: Nivel[];
}

export interface Pasillo {
  id: string;
  codigo: string;
  descripcion: string | null;
  estanterias: Estanteria[];
}

export interface Almacen {
  id: string;
  codigo: string;
  nombre: string;
  direccion: string | null;
}

export interface Ocupacion {
  hueco_id: string;
  unidades: number;
  referencias: number;
}

/** Fila de la vista v_huecos (hueco con toda su ruta). */
export interface HuecoPlano {
  id: string;
  codigo_completo: string;
  codigo: string;
  capacidad: number | null;
  activo: boolean;
  notas: string | null;
  nivel_id: string;
  nivel_codigo: string;
  nivel_orden: number;
  estanteria_id: string;
  estanteria_codigo: string;
  pasillo_id: string;
  pasillo_codigo: string;
  almacen_id: string;
  almacen_codigo: string;
  almacen_nombre: string;
}

export type EstadoHueco = 'vacio' | 'parcial' | 'lleno' | 'ocupado' | 'bloqueado';
