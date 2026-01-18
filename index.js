// App.js - Fan Design Calculator for Android (React Native)
import React, { useState, useMemo, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Share,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  Svg,
  Circle,
  Path,
  Line,
  Rect,
  G,
  Text as SvgText,
  Defs,
  Marker,
} from 'react-native-svg';

// --- DATA: APPLICATION PROFILES ---
const APP_PROFILES = {
  General: { label: "General Ventilation", desc: "Balanced flow and pressure.", bladeType: "Backward", recOutlet: 35, recInlet: 25 },
  'High Pressure': { label: "High Pressure Blower", desc: "Narrow impeller.", bladeType: "Radial", recOutlet: 90, recInlet: 35 },
  'High Flow': { label: "High Suction / Flow", desc: "Wide impeller.", bladeType: "Forward", recOutlet: 145, recInlet: 20 },
  Transport: { label: "High Velocity / Transport", desc: "Rugged design.", bladeType: "Radial", recOutlet: 90, recInlet: 45 }
};

// --- MATERIALS ---
const materials = {
  Steel: { density: 7850, yield: 250, poisson: 0.3, youngs: 200, price: 1.5, name: "Carbon Steel" },
  Aluminum_Alloy: { density: 2700, yield: 150, poisson: 0.33, youngs: 70, price: 3.2, name: "Aluminum Alloy" },
  Cast_Iron: { density: 7200, yield: 200, poisson: 0.27, youngs: 100, price: 1.2, name: "Cast Iron" },
  FRP: { density: 1800, yield: 60, poisson: 0.35, youngs: 20, price: 4.5, name: "Fiberglass (FRP)" },
  Plastic: { density: 1400, yield: 40, poisson: 0.4, youngs: 2, price: 0.8, name: "ABS Plastic" }
};

// --- UNIT CONVERSION FACTORS ---
const UNIT_DATA = {
  flow: { base: "CFM", units: { "CFM": 1, "m³/hr": 1.69901, "L/s": 0.471947 } },
  pressure: { base: "Pa", units: { "Pa": 1, "kPa": 0.001, "psi": 0.000145038, "in. wg": 0.00401463 } },
  power: { base: "kW", units: { "kW": 1, "HP": 1.341, "W": 1000 } },
  length: { base: "mm", units: { "mm": 1, "cm": 0.1, "inch": 0.0393701, "ft": 0.00328084 } },
  temperature: { base: "°C", units: ["°C", "°F", "K"] }
};

// --- CORE CALCULATION FUNCTION (IDENTICAL LOGIC) ---
const calculateResults = (inputs) => {
  const flowRate = Number(inputs.flowRate) || 0;
  const staticPressure = Number(inputs.staticPressure) || 0;
  const rpm = Number(inputs.rpm) || 0;
  const motorRating = Number(inputs.motorRating) || 0;
  const temp = Number(inputs.temp) || 0;
  const altitude = Number(inputs.altitude) || 0;
  const outletAngle = Number(inputs.outletAngle) || 0;
  const inletAngle = Number(inputs.inletAngle) || 0;

  // Air properties
  const airDensityUS = 0.075 * (530 / (460 + temp)) * Math.pow((1 - 0.0000068756 * altitude), 5.2559);
  const airDensitySI = airDensityUS * 16.0185;
  const altitudeWarning = altitude > 5000 ? "High altitude warning" : "OK";

  // Unit conversions
  const Q_si = flowRate * 0.000471947; // m³/s
  const P_inwg = staticPressure / 249.088;

  // Specific speed
  const Ns_US = (rpm * Math.sqrt(flowRate)) / (Math.pow(P_inwg, 0.75) || 0.001);
  let bladeRecommendation = "Backward Curved";
  if (Ns_US < 5000) bladeRecommendation = "Radial";
  else if (Ns_US > 30000) bladeRecommendation = "Forward";

  // Efficiency & tip speed
  const psi = 0.0133 * outletAngle + 0.4;
  const effStatic = Math.max(0.3, 0.52 + 0.12 * Math.log10(flowRate || 1) - Math.abs(outletAngle - 40) * 0.002);
  const tipSpeedActual = Math.sqrt((2 * staticPressure) / (airDensitySI * psi * effStatic)) * 1.1;
  const tipSpeedCheck = tipSpeedActual > 200 ? "Tip speed too high!" : "OK";

  // Dimensions (mm)
  const D2_m = (tipSpeedActual * 60) / (Math.PI * rpm);
  const D2_mm = D2_m * 1000;
  const D1_mm = D2_mm * 0.5;
  const D_hub_mm = D1_mm * 0.4;
  const b2_mm = (Q_si / (Math.PI * D2_m * (0.25 * tipSpeedActual))) * 1000;
  const b1_mm = b2_mm * (D2_mm / D1_mm);

  // Blade count
  const beta2Rad = (outletAngle * Math.PI) / 180;
  const bladeCountCalc = (D2_m - D1_m) > 0 ? 8.5 * Math.sin(beta2Rad) * (D2_m / (D2_m - D1_m)) : 10;
  const bladeCountFinal = Math.max(6, Math.min(12, Math.round(bladeCountCalc)));

  // Stress
  const mat = materials[inputs.material];
  const sigma_c = (mat.density * Math.pow(tipSpeedActual, 2) * (1 + mat.poisson)) / 3;
  const sigma_total_mpa = sigma_c / 1e6;
  const safetyFactor = mat.yield / sigma_total_mpa;
  const stressStatus = safetyFactor > 2 ? "SAFE" : safetyFactor > 1.5 ? "ACCEPTABLE" : "UNSAFE";

  // Power
  const airPowerHP = (flowRate * P_inwg) / 6356;
  const brakePowerHP = airPowerHP / effStatic;
  const motorLoadPct = motorRating > 0 ? (brakePowerHP / motorRating) * 100 : 0;
  const motorCheck = motorLoadPct > 100 ? "OVERLOADED" : motorLoadPct > 85 ? "High Load" : "OK";

  // Shaft
  const torqueNm = (brakePowerHP * 0.7457 * 9550) / (rpm || 1);
  const shaftDiaStd = Math.max(20, Math.round(Math.pow((16 * torqueNm * 1.5) / (Math.PI * 40e6), 1 / 3) * 1000));

  // CAD Script (simplified)
  const cadScript = `; Fan Design\nCIRCLE 0,0 ${D2_mm.toFixed(0)}\nCIRCLE 0,0 ${D1_mm.toFixed(0)}\n; Blades: ${bladeCountFinal}`;

  return {
    airDensityUS,
    airDensitySI,
    altitudeWarning,
    Ns_US,
    bladeRecommendation,
    effStatic,
    tipSpeedActual,
    tipSpeedCheck,
    D2_mm,
    D1_mm,
    b2_mm,
    b1_mm,
    D_hub_mm,
    bladeCountFinal,
    sigma_total_mpa,
    safetyFactor,
    stressStatus,
    brakePowerHP,
    motorLoadPct,
    motorCheck,
    shaftDiaStd,
    torqueNm,
    cadScript
  };
};

// --- COMPONENTS ---
const ResultCard = ({ title, value, unit, status }) => {
  const bgColor = status === 'SAFE' ? '#d1fad1' : status === 'UNSAFE' ? '#fad1d1' : '#f0f0f0';
  return (
    <View style={[styles.resultCard, { backgroundColor: bgColor }]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>
        {typeof value === 'number' ? value.toFixed(2) : value}
        {unit ? ` ${unit}` : ''}
      </Text>
    </View>
  );
};

const InputRow = ({ label, value, onChange, unit, suggestion, onSuggest }) => (
  <View style={styles.inputRow}>
    <Text style={styles.label}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TextInput
        style={styles.input}
        value={String(value)}
        onChangeText={onChange}
        keyboardType="numeric"
      />
      {unit && <Text style={styles.unit}>{unit}</Text>}
    </View>
    {suggestion !== undefined && (
      <TouchableOpacity onPress={() => onSuggest(suggestion)}>
        <Text style={styles.suggestion}>Sugg: {suggestion}°</Text>
      </TouchableOpacity>
    )}
  </View>
);

// --- MAIN APP ---
const App = () => {
  const [inputs, setInputs] = useState({
    flowRate: '5000',
    staticPressure: '1000',
    rpm: '1750',
    motorRating: '10',
    temp: '70',
    altitude: '0',
    bladeType: 'Backward',
    material: 'Steel',
    outletAngle: '35',
    inletAngle: '25',
    application: 'General'
  });

  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);

  // Load history on start
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const saved = await AsyncStorage.getItem('fanHistory');
        if (saved) setHistory(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to load history');
      }
    };
    loadHistory();
  }, []);

  const saveHistory = async (newHistory) => {
    try {
      await AsyncStorage.setItem('fanHistory', JSON.stringify(newHistory));
    } catch (e) {
      console.warn('Failed to save history');
    }
  };

  const handleInput = (key, value) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  };

  const suggestions = useMemo(() => {
    const app = APP_PROFILES[inputs.application] || APP_PROFILES.General;
    let recOutlet = app.recOutlet;
    if (inputs.bladeType === 'Radial') recOutlet = 90;
    else if (inputs.bladeType === 'Forward') recOutlet = 145;

    // Simple inlet estimate
    const recInlet = 25;
    return { outlet: recOutlet, inlet: recInlet };
  }, [inputs.application, inputs.bladeType]);

  const applyDefaults = () => {
    const app = APP_PROFILES[inputs.application];
    setInputs(prev => ({
      ...prev,
      bladeType: app.bladeType,
      outletAngle: String(app.recOutlet),
      inletAngle: String(suggestions.inlet)
    }));
  };

  const handleCalculate = () => {
    const numInputs = {};
    for (let key in inputs) {
      numInputs[key] = key.includes('Angle') || key === 'temp' || key === 'altitude'
        ? inputs[key]
        : parseFloat(inputs[key]);
    }
    const newResults = calculateResults(numInputs);
    setResults(newResults);

    const item = {
      id: Date.now(),
      timestamp: new Date().toLocaleString(),
      inputs: { ...inputs },
      summary: {
        flow: parseFloat(inputs.flowRate),
        pressure: parseFloat(inputs.staticPressure),
        power: newResults.brakePowerHP,
        diameter: newResults.D2_mm
      }
    };
    const newHistory = [item, ...history.slice(0, 19)]; // Keep last 20
    setHistory(newHistory);
    saveHistory(newHistory);
  };

  const shareScript = async () => {
    if (!results) return;
    try {
      await Share.share({
        title: 'Fan Design CAD Script',
        message: results.cadScript
      });
    } catch (e) {
      Alert.alert('Error', 'Could not share script');
    }
  };

  const copyScript = async () => {
    if (!results) return;
    Clipboard.setString(results.cadScript);
    Alert.alert('Copied!', 'CAD script copied to clipboard');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>FanDesign Pro</Text>
          <Text style={styles.subtitle}>Centrifugal Fan Calculator</Text>
        </View>

        {/* Application Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Design Application</Text>
          <View style={styles.pickerWrapper}>
            {Object.keys(APP_PROFILES).map(key => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.appButton,
                  inputs.application === key && styles.appButtonActive
                ]}
                onPress={() => handleInput('application', key)}
              >
                <Text style={inputs.application === key ? styles.appButtonTextActive : styles.appButtonText}>
                  {APP_PROFILES[key].label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.applyButton} onPress={applyDefaults}>
            <Text style={styles.applyButtonText}>Apply Suggested Settings</Text>
          </TouchableOpacity>
        </View>

        {/* Inputs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operating Conditions</Text>
          <InputRow label="Flow Rate" value={inputs.flowRate} onChange={(v) => handleInput('flowRate', v)} unit="CFM" />
          <InputRow label="Static Pressure" value={inputs.staticPressure} onChange={(v) => handleInput('staticPressure', v)} unit="Pa" />
          <InputRow label="RPM" value={inputs.rpm} onChange={(v) => handleInput('rpm', v)} unit="RPM" />
          <InputRow label="Motor Power" value={inputs.motorRating} onChange={(v) => handleInput('motorRating', v)} unit="HP" />
          <InputRow label="Temperature" value={inputs.temp} onChange={(v) => handleInput('temp', v)} unit="°F" />
          <InputRow label="Altitude" value={inputs.altitude} onChange={(v) => handleInput('altitude', v)} unit="ft" />

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Design Specs</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Blade Type</Text>
            {['Radial', 'Backward', 'Forward'].map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.radio, inputs.bladeType === type && styles.radioActive]}
                onPress={() => handleInput('bladeType', type)}
              >
                <Text style={inputs.bladeType === type ? styles.radioTextActive : styles.radioText}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Material</Text>
            {Object.keys(materials).map(mat => (
              <TouchableOpacity
                key={mat}
                style={[styles.radio, inputs.material === mat && styles.radioActive]}
                onPress={() => handleInput('material', mat)}
              >
                <Text style={inputs.material === mat ? styles.radioTextActive : styles.radioText}>
                  {materials[mat].name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <InputRow
            label="Outlet Angle"
            value={inputs.outletAngle}
            onChange={(v) => handleInput('outletAngle', v)}
            unit="°"
            suggestion={suggestions.outlet}
            onSuggest={(v) => handleInput('outletAngle', String(v))}
          />
          <InputRow
            label="Inlet Angle"
            value={inputs.inletAngle}
            onChange={(v) => handleInput('inletAngle', v)}
            unit="°"
            suggestion={suggestions.inlet}
            onSuggest={(v) => handleInput('inletAngle', String(v))}
          />
        </View>

        {/* Calculate Button */}
        <TouchableOpacity style={styles.calculateButton} onPress={handleCalculate}>
          <Text style={styles.calculateButtonText}>CALCULATE DESIGN</Text>
        </TouchableOpacity>

        {/* Results */}
        {results && (
          <View style={styles.resultsSection}>
            <Text style={styles.sectionTitle}>Results</Text>

            <ResultCard title="Impeller Diameter" value={results.D2_mm} unit="mm" />
            <ResultCard title="Blade Count" value={results.bladeCountFinal} unit="" />
            <ResultCard title="Efficiency" value={results.effStatic * 100} unit="%" />
            <ResultCard title="Brake Power" value={results.brakePowerHP} unit="HP" status={results.motorCheck === 'OK' ? 'SAFE' : 'UNSAFE'} />
            <ResultCard title="Stress Safety" value={results.safetyFactor} unit="" status={results.stressStatus} />

            <Text style={styles.sectionTitle}>CAD Export</Text>
            <View style={styles.scriptActions}>
              <TouchableOpacity style={styles.actionButton} onPress={copyScript}>
                <Text style={styles.actionButtonText}>Copy Script</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={shareScript}>
                <Text style={styles.actionButtonText}>Share Script</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.scriptPreview}>
              <Text style={styles.scriptText}>{results.cadScript.substring(0, 200)}...</Text>
            </View>

            {/* Sketches */}
            <Text style={styles.sectionTitle}>Impeller Sketch</Text>
            <View style={styles.sketchContainer}>
              <Svg width="100%" height="200" viewBox="0 0 300 200">
                <Circle cx="150" cy="100" r={results.D2_mm / 6} stroke="#333" fill="none" />
                <Circle cx="150" cy="100" r={results.D1_mm / 6} stroke="#333" fill="none" strokeDasharray="4,4" />
                <Circle cx="150" cy="100" r={results.D_hub_mm / 6} fill="#ddd" stroke="#333" />
                {[...Array(results.bladeCountFinal)].map((_, i) => {
                  const angle = (i * 360 / results.bladeCountFinal) * Math.PI / 180;
                  const x1 = 150 + (results.D1_mm / 6) * Math.cos(angle);
                  const y1 = 100 + (results.D1_mm / 6) * Math.sin(angle);
                  const x2 = 150 + (results.D2_mm / 6) * Math.cos(angle - 0.3);
                  const y2 = 100 + (results.D2_mm / 6) * Math.sin(angle - 0.3);
                  return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#000" strokeWidth="2" />;
                })}
              </Svg>
            </View>
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Recent Designs</Text>
            {history.slice(0, 3).map(item => (
              <View key={item.id} style={styles.historyItem}>
                <Text>{item.timestamp}</Text>
                <Text>{item.summary.flow} CFM | {item.summary.pressure} Pa</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#1e40af' },
  subtitle: { fontSize: 14, color: '#64748b' },
  section: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#1e293b' },
  inputRow: { marginBottom: 12 },
  label: { fontSize: 14, color: '#334155', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, padding: 8, fontSize: 16, flex: 1 },
  unit: { marginLeft: 8, fontSize: 14, color: '#64748b', alignSelf: 'center' },
  suggestion: { fontSize: 12, color: '#3b82f6', marginTop: 4, textDecorationLine: 'underline' },
  pickerWrapper: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  appButton: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20 },
  appButtonActive: { backgroundColor: '#dbeafe', borderColor: '#93c5fd' },
  appButtonText: { fontSize: 12, color: '#475569' },
  appButtonTextActive: { color: '#1d4ed8', fontWeight: '600' },
  applyButton: { backgroundColor: '#dbeafe', padding: 10, borderRadius: 8, alignItems: 'center' },
  applyButtonText: { color: '#1d4ed8', fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  radio: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 20 },
  radioActive: { backgroundColor: '#dcfce7', borderColor: '#4ade80' },
  radioText: { fontSize: 12, color: '#475569' },
  radioTextActive: { color: '#16a34a', fontWeight: '600' },
  calculateButton: { backgroundColor: '#1d4ed8', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 24 },
  calculateButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  resultsSection: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  resultCard: { padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  cardValue: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  scriptActions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  actionButton: { flex: 1, padding: 12, backgroundColor: '#e0f2fe', borderRadius: 8, alignItems: 'center' },
  actionButtonText: { color: '#0369a1', fontWeight: '600' },
  scriptPreview: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 8, fontFamily: 'monospace' },
  scriptText: { fontSize: 12, color: '#334155' },
  sketchContainer: { marginTop: 12, backgroundColor: '#f8fafc', padding: 8, borderRadius: 8 },
  historySection: { backgroundColor: '#fff', padding: 16, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  historyItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }
});

export default App;
