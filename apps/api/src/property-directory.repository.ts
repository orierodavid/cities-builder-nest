import type { PoolClient } from "pg";

export interface BuildingListItem {
  id: string;
  estate_id: string;
  name: string;
  created_at: string;
}

export interface UnitListItem {
  id: string;
  estate_id: string;
  building_id: string;
  unit_code: string;
  unit_type: string | null;
  status: string;
}

export interface RepositoryPage<T> {
  items: T[];
  hasMore: boolean;
}

/**
 * Reads one extra row so the API can preserve its existing hasMore pagination
 * contract. The caller must use withAuthenticatedTransaction() so PostgreSQL
 * evaluates the same authenticated user's RLS policies.
 */
export async function getBuildingsForEstate(
  client: PoolClient,
  estateId: string,
  pageSize: number,
  offset: number,
): Promise<RepositoryPage<BuildingListItem>> {
  const result = await client.query<BuildingListItem>(
    `SELECT id, estate_id, name, created_at
     FROM public.buildings
     WHERE estate_id = $1
     ORDER BY name ASC
     LIMIT $2 OFFSET $3`,
    [estateId, pageSize + 1, offset],
  );
  return {
    items: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}

export async function getUnitsForEstate(
  client: PoolClient,
  estateId: string,
  pageSize: number,
  offset: number,
): Promise<RepositoryPage<UnitListItem>> {
  const result = await client.query<UnitListItem>(
    `SELECT id, estate_id, building_id, unit_code, unit_type, status
     FROM public.units
     WHERE estate_id = $1
     ORDER BY unit_code ASC
     LIMIT $2 OFFSET $3`,
    [estateId, pageSize + 1, offset],
  );
  return {
    items: result.rows.slice(0, pageSize),
    hasMore: result.rows.length > pageSize,
  };
}
