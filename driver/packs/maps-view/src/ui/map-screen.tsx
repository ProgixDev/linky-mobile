import MapView, { Marker } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

import { type Coord, type MapMarker } from '../model/marker';

/**
 * DESIGN: replace after the Claude Design pass. Functional placeholder map:
 * renders markers around a center. Pass markers from useNearby, and handle taps
 * via onSelect (e.g. open a detail sheet or route there with nav-turn-by-turn).
 */
export function MapScreen({
  center,
  markers,
  onSelect,
}: {
  center: Coord;
  markers: MapMarker[];
  onSelect?: (m: MapMarker) => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {markers.map((m) => (
          <Marker
            key={m.id}
            identifier={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.title}
            onPress={() => onSelect?.(m)}
          />
        ))}
      </MapView>
    </View>
  );
}
