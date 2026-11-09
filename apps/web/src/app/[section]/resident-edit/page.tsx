"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

type Building = { id: string; name: string };
type Unit = { id: string; unit_code: string; building_id: string };

export default function ResidentEditPage() {
  const router = useRouter();
  const params = useSearchParams();
  const estateId = params.get("estateId") || "";
  const userId = params.get("userId") || "";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeNumber, setHomeNumber] = useState("");
  const [streetName, setStreetName] = useState("");
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [buildingId, setBuildingId] = useState("");
  const [unitId, setUnitId] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!estateId || !userId) {
        setError("The resident or estate details are missing. Return to the resident directory and try again.");
        setLoading(false);
        return;
      }
      const [{ data: profile, error: profileError }, { data: buildingRows, error: buildingError }, { data: unitRows, error: unitError }, { data: assignment, error: assignmentError }] = await Promise.all([
        supabase.from("users").select("full_name,phone_e164,home_number,street_name").eq("id", userId).maybeSingle(),
        supabase.from("buildings").select("id,name").eq("estate_id", estateId).order("name"),
        supabase.from("units").select("id,unit_code,building_id").eq("estate_id", estateId).order("unit_code"),
        supabase.from("resident_units").select("unit_id").eq("estate_id", estateId).eq("resident_user_id", userId).is("end_date", null).maybeSingle()
      ]);
      if (!active) return;
      if (profileError || buildingError || unitError || assignmentError || !profile) {
        setError("Resident details and property assignments could not be loaded. Check your access and try again.");
        setLoading(false);
        return;
      }
      const buildingList = (buildingRows || []) as Building[];
      const unitList = (unitRows || []) as Unit[];
      const currentUnit = unitList.find((unit) => unit.id === assignment?.unit_id);
      setFullName(profile.full_name || "");
      setPhone(profile.phone_e164 || "");
      setHomeNumber(profile.home_number || "");
      setStreetName(profile.street_name || "");
      setBuildings(buildingList);
      setUnits(unitList);
      setBuildingId(currentUnit?.building_id || "");
      setUnitId(currentUnit?.id || "");
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [estateId, userId]);

  const availableUnits = useMemo(() => units.filter((unit) => unit.building_id === buildingId), [units, buildingId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (fullName.trim().length < 2) {
      setError("Enter the resident's full name.");
      return;
    }
    if (phone.trim() && phone.trim().length < 7) {
      setError("Enter a valid phone number, including the country code where possible.");
      return;
    }
    setSaving(true);
    const { error: saveError } = await supabase.rpc("management_update_resident_profile", {
      p_estate_id: estateId,
      p_resident_user_id: userId,
      p_full_name: fullName.trim(),
      p_phone_e164: phone.trim() || null,
      p_home_number: homeNumber.trim() || null,
      p_street_name: streetName.trim() || null,
      p_unit_id: unitId || null
    });
    if (saveError) {
      setError(saveError.message || "Resident details could not be saved. Please try again.");
      setSaving(false);
      return;
    }
    setSuccess("Resident profile and property assignment have been updated.");
    setSaving(false);
  }

  return (
    <PortalFrame title="Edit Resident" description="Update the resident's contact details and assigned home within this estate.">
      <section className="panel module-panel">
        <div className="module-toolbar">
          <div><h3>Resident profile</h3><p>Changes are saved to the resident's profile and active property assignment.</p></div>
          <button type="button" className="secondary-action" onClick={() => router.back()}>← Back to residents</button>
        </div>
        {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
        {success && <div className="user-alert user-alert-success" role="status">{success}</div>}
        {loading ? <p className="empty-cell">Loading resident details…</p> : (
          <form className="user-form" onSubmit={save}>
            <div className="user-form-heading"><strong>Personal details</strong><span>Correct the resident's name and contact number.</span></div>
            <div className="user-form-grid">
              <label>Full name<input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
              <label>Phone number<input type="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+234…" /></label>
            </div>
            <div className="user-form-heading"><strong>Home address</strong><span>These details are shown as the resident's home or unit address.</span></div>
            <div className="user-form-grid">
              <label>Home number / Apartment<input maxLength={80} value={homeNumber} onChange={(event) => setHomeNumber(event.target.value)} placeholder="e.g. House 12 or Flat 3B" /></label>
              <label>Street name<input maxLength={160} value={streetName} onChange={(event) => setStreetName(event.target.value)} placeholder="Street name" /></label>
            </div>
            <div className="user-form-heading"><strong>Estate property assignment</strong><span>Choose the building and unit currently occupied by this resident.</span></div>
            <div className="user-form-grid">
              <label>Building<select value={buildingId} onChange={(event) => { setBuildingId(event.target.value); setUnitId(""); }}><option value="">No building selected</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}</option>)}</select></label>
              <label>Unit<select value={unitId} onChange={(event) => setUnitId(event.target.value)} disabled={!buildingId}><option value="">No unit assigned</option>{availableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_code}</option>)}</select></label>
            </div>
            <p className="notice-line">Leaving the unit unassigned removes the resident's active building/unit assignment. The home number and street name remain part of the resident profile.</p>
            <div className="user-form-actions">
              <button type="button" className="secondary-action" onClick={() => router.back()} disabled={saving}>Cancel</button>
              <button type="submit" className="primary-action" disabled={saving}>{saving ? "Saving changes…" : "Save changes"}</button>
            </div>
          </form>
        )}
      </section>
    </PortalFrame>
  );
}
