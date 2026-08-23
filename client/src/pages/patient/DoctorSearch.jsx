import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { Card } from '../../components/common/Card';
import { Spinner } from '../../components/common/Spinner';
import { Badge } from '../../components/common/Badge';
import {
  Search,
  Stethoscope,
  Star,
  Clock,
  IndianRupee,
  ChevronRight,
  UserRound,
  SlidersHorizontal,
} from 'lucide-react';

const SPECIALTIES = [
  'All Specialties',
  'Cardiology',
  'Dermatology',
  'Neurology',
  'Orthopedics',
  'Pediatrics',
  'Psychiatry',
  'Radiology',
  'Internal Medicine',
  'General Practice',
];

export const DoctorSearch = () => {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input by 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (specialty && specialty !== 'All Specialties') params.set('specialty', specialty);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await api.get(`/doctors${params.toString() ? '?' + params.toString() : ''}`);
      if (res.success) setDoctors(res.data.doctors);
    } catch (err) {
      console.error('Failed to load doctors:', err);
    } finally {
      setLoading(false);
    }
  }, [specialty, debouncedSearch]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  const getInitials = (name = '') =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join('');

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Find a Physician</h1>
        <p className="text-sm text-slate-500 mt-1">
          Browse our network of specialists and book a consultation online.
        </p>
      </div>

      {/* Search & filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by doctor name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition"
          />
        </div>

        <div className="relative min-w-[200px]">
          <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value === 'All Specialties' ? '' : e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition appearance-none cursor-pointer"
          >
            {SPECIALTIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none rotate-90" />
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : doctors.length === 0 ? (
        <Card className="text-center py-16 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 mx-auto flex items-center justify-center">
            <Stethoscope className="w-7 h-7" />
          </div>
          <p className="font-semibold text-slate-800">No physicians found</p>
          <p className="text-sm text-slate-500">Try adjusting your search or specialty filter.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {doctors.map((doc) => (
            <DoctorCard
              key={doc._id}
              doc={doc}
              onBook={() => navigate(`/patient/doctors/${doc.userId?._id}`)}
              getInitials={getInitials}
            />
          ))}
        </div>
      )}

      {!loading && (
        <p className="text-xs text-slate-400 text-center">
          Showing {doctors.length} physician{doctors.length !== 1 ? 's' : ''}
          {specialty ? ` in ${specialty}` : ''}
          {debouncedSearch ? ` matching "${debouncedSearch}"` : ''}
        </p>
      )}
    </div>
  );
};

const DoctorCard = ({ doc, onBook, getInitials }) => {
  const workingDays = (doc.workingHours || []).length;

  return (
    <Card className="flex flex-col gap-4 hover:shadow-md transition-shadow duration-200">
      {/* Avatar + name row */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-sm">
          {getInitials(doc.userId?.name)}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-sm leading-tight truncate">
            Dr. {doc.userId?.name}
          </h3>
          <Badge variant="primary" className="mt-1 text-[11px]">
            {doc.specialty}
          </Badge>
        </div>
      </div>

      {/* Bio snippet */}
      {doc.bio && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{doc.bio}</p>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-xl p-2">
          <div className="flex items-center justify-center gap-1 text-teal-700">
            <IndianRupee className="w-3.5 h-3.5" />
            <span className="text-sm font-bold">{doc.consultationFee}</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Fee</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-2">
          <div className="flex items-center justify-center gap-1 text-slate-700">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-bold">{doc.slotDurationMinutes ?? 30}m</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Slot</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-2">
          <div className="flex items-center justify-center gap-1 text-slate-700">
            <UserRound className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-bold">{workingDays}</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Days/wk</p>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onBook}
        className="mt-auto w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
      >
        <Stethoscope className="w-4 h-4" />
        View & Book
      </button>
    </Card>
  );
};
