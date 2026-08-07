import stationThalassaUrl from '@/assets/models/stations/station_thalassa.glb?url'
import stationAresUrl from '@/assets/models/stations/station_ares.glb?url'
import stationKronosUrl from '@/assets/models/stations/station_kronos.glb?url'

export const STATION_MODEL_URLS = {
  thalassa: stationThalassaUrl,
  ares: stationAresUrl,
  kronos: stationKronosUrl,
} as const
