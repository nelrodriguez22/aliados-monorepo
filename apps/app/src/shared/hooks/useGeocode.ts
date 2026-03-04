import { useState, useRef, useCallback } from 'react';
import { apiClient } from '@/shared/lib/apiClient';
import toast from 'react-hot-toast';

interface Coords {
  lat: number;
  lng: number;
}

interface Sugerencia {
  description: string;
  [key: string]: any;
}

export function useGeocode() {
  const [direccion, setDireccion] = useState('');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [showSugerencias, setShowSugerencias] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const obtenerUbicacionGPS = useCallback(async () => {
    setGettingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 15000,
          maximumAge: 30000,
          enableHighAccuracy: false,
        });
      });

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setCoords({ lat, lng });

      const data = await apiClient.get(`/api/geocoding/reverse?lat=${lat}&lng=${lng}`);
      if (data.results && data.results.length > 0) {
        setDireccion(data.results[0].formatted_address);
      }

      toast.success('Ubicación GPS obtenida');
      return { lat, lng };
    } catch (error: any) {
      if (error.code === 1) {
        toast.error('Permiso de ubicación denegado. Ingresá tu dirección manualmente.');
      } else {
        toast('No pudimos obtener tu ubicación GPS. Ingresá tu dirección manualmente.', { icon: '📍' });
      }
      return null;
    } finally {
      setGettingLocation(false);
    }
  }, []);

  const geocodificarDireccion = useCallback(async (address?: string) => {
    const addr = address || direccion;
    if (!addr.trim()) {
      toast.error('Ingresá una dirección');
      return null;
    }

    setGettingLocation(true);
    try {
      const data = await apiClient.get(
        `/api/geocoding/forward?address=${encodeURIComponent(addr)}`
      );

      if (data.results && data.results.length > 0) {
        const result = {
          lat: data.results[0].geometry.location.lat,
          lng: data.results[0].geometry.location.lng,
        };
        setCoords(result);
        setDireccion(data.results[0].formatted_address);
        return result;
      } else {
        toast.error('No se encontró la dirección');
        return null;
      }
    } catch {
      toast.error('Error al buscar la dirección');
      return null;
    } finally {
      setGettingLocation(false);
    }
  }, [direccion]);

  const handleDireccionChange = useCallback((value: string) => {
    setDireccion(value);
    setCoords(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (value.length < 3) {
        setSugerencias([]);
        setShowSugerencias(false);
        return;
      }

      try {
        const data = await apiClient.get(
          `/api/geocoding/autocomplete?input=${encodeURIComponent(value)}`
        );

        if (data.predictions && data.predictions.length > 0) {
          setSugerencias(data.predictions);
          setShowSugerencias(true);
        } else {
          setSugerencias([]);
          setShowSugerencias(false);
        }
      } catch {
        // Silenciar errores de autocomplete
      }
    }, 300);
  }, []);

  const seleccionarSugerencia = useCallback(async (sugerencia: Sugerencia) => {
    setDireccion(sugerencia.description);
    setShowSugerencias(false);
    setSugerencias([]);

    try {
      const data = await apiClient.get(
        `/api/geocoding/forward?address=${encodeURIComponent(sugerencia.description)}`
      );

      if (data.results && data.results.length > 0) {
        setCoords({
          lat: data.results[0].geometry.location.lat,
          lng: data.results[0].geometry.location.lng,
        });
      }
    } catch {
      console.error('Error geocodificando sugerencia');
    }
  }, []);

  const reset = useCallback(() => {
    setDireccion('');
    setCoords(null);
    setSugerencias([]);
    setShowSugerencias(false);
  }, []);

  return {
    direccion,
    setDireccion,
    coords,
    setCoords,
    gettingLocation,
    sugerencias,
    showSugerencias,
    setShowSugerencias,
    obtenerUbicacionGPS,
    geocodificarDireccion,
    handleDireccionChange,
    seleccionarSugerencia,
    reset,
  };
}
