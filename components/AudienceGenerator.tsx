import React, { useState } from 'react';
import { generateAudienceSegments, generateImageFromPrompt, generateSyntheticPersona } from '../services/geminiService';
import { brandConfig } from '../config';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, TrendingUp, BarChart2, DollarSign, Briefcase, Heart, RotateCcw, ArrowLeft, Shield } from 'lucide-react';
import { CombinedPersona, DetailedPersona } from '../types';

interface AudienceGeneratorProps {
  personas: CombinedPersona[];
  setPersonas: React.Dispatch<React.SetStateAction<CombinedPersona[]>>;
  context: string;
  setContext: React.Dispatch<React.SetStateAction<string>>;
}

export const AudienceGenerator: React.FC<AudienceGeneratorProps> = ({ personas, setPersonas, context, setContext }) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");

  React.useEffect(() => {
    if (personas.length > 0) {
      fetch('/api/save-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          featureId: 'audience_generator',
          data: { personas, context }
        })
      }).catch(err => console.error("Failed to save audience run:", err));
    }
  }, [personas, context]);

  const handleLoadLast = async () => {
    setIsLoading(true);
    setLoadingStep("Loading previous session...");
    try {
      const res = await fetch('/api/load-run/audience_generator');
      if (!res.ok) throw new Error("No saved run found");
      const data = await res.json();

      if (data.personas) {
        setPersonas(data.personas);
        setStep(2);
      }
      if (data.context) setContext(data.context);
    } catch (error) {
      console.warn(error);
      alert("No previous session found.");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setPersonas([]);
    setLoadingStep("Identifying Key Member Segments...");

    try {
      const explicitContext = `${context}. Segment these customers into exactly three audiences based on the data. Data: ${JSON.stringify(SAMPLE_CUSTOMER_DATA)}`;
      const segments = await generateAudienceSegments(explicitContext);

      // Basic validation
      if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error("Invalid or empty audience generation result");
      }

      setPersonas(segments);
      setStep(2);

      setLoadingStep("Generating Synthetic Personas & Health Insights...");

      for (let index = 0; index < segments.length; index++) {
        const seg = segments[index];
        try {
          // Always generate image
          generateImageFromPrompt(seg.imagePrompt + " professional portrait, high quality, studio lighting, natural look")
            .then(url => {
              setPersonas(prev => {
                const newP = [...prev];
                if (newP[index] && !newP[index].imageUrl) newP[index] = { ...newP[index], imageUrl: url };
                return newP;
              });
            })
            .catch(err => console.error("Image gen error", err));

          const details = await generateSyntheticPersona(seg.personaName, seg.name, explicitContext);
          if (details) {
            // Use LLM generated products, ensure array and limit to 5
            details.preferred_products = (details.preferred_products || []).slice(0, 5);

            setPersonas(prev => {
              const newP = [...prev];
              if (newP[index]) newP[index] = { ...newP[index], details: details };
              return newP;
            });
          }
        } catch (err) {
          console.error(`Error enhancing persona ${index}:`, err);
        }
      }
      setLoadingStep("");
    } catch (error) {
      console.error(error);
      alert("Failed to generate audiences.");
      setLoadingStep("");
      setStep(1);
    } finally {
      setIsLoading(false);
    }
  };

  const transformChartData = (chartData: { labels: string[], data: number[] }) => {
    return chartData.labels.map((label, i) => ({
      name: label,
      value: chartData.data[i]
    }));
  };

  const SAMPLE_CUSTOMER_DATA = [
    { email: 'alex@demo.com', name: 'Alex', topChannel: 'Portal', condition: "New Baby", location: 'Pennsylvania' },
    { email: 'jordan@demo.com', name: 'Jordan', topChannel: 'App', condition: 'Type 2 Diabetes', location: 'New York' },
    { email: 'casey@demo.com', name: 'Casey', topChannel: 'Phone', condition: 'Retiring Soon', location: 'Delaware' },
    { email: 'taylor@demo.com', name: 'Taylor', topChannel: 'Email', condition: "Preventive Care", location: 'West Virginia' },
    { email: 'morgan@demo.com', name: 'Morgan', topChannel: 'Portal', condition: "Mental Health", location: 'Pennsylvania' },
    { email: 'riley@demo.com', name: 'Riley', topChannel: 'App', condition: 'Knee Surgery', location: 'Ohio' },
    { email: 'jamie@demo.com', name: 'Jamie', topChannel: 'Phone', condition: "New Marriage", location: 'Pennsylvania' },
    { email: 'quinn@demo.com', name: 'Quinn', topChannel: 'Email', condition: "Chronic Back Pain", location: 'New York' },
    { email: 'avery@demo.com', name: 'Avery', topChannel: 'Portal', condition: 'Weight Loss', location: 'Delaware' },
    { email: 'reese@demo.com', name: 'Reese', topChannel: 'App', condition: 'None', location: 'West Virginia' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-8 mb-20">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="section-header">Audience Generator</h2>
          <p className="text-subtext mt-1">Segment member populations and generate detailed health personas.</p>
        </div>
      </div>

      {step === 1 && (
        <div className="content-card mb-12 animate-fadeIn">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-heading">Member Data Preview</h3>
            <div className="flex gap-4 items-center">
              <button
                onClick={handleLoadLast}
                className="btn-ghost flex items-center gap-2"
                title="Replay last run"
                disabled={isLoading}
              >
                <RotateCcw size={16} /> Load Last
              </button>
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="btn-primary flex items-center gap-2"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
                    Processing...
                  </div>
                ) : "Generate Personas"}
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="form-label">Context</label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="input-field"
              placeholder="Enter context (e.g. Healthco Health Member Segmentation)..."
            />
          </div>

          <div className="overflow-x-auto mb-8 border border-gray-200 rounded-lg">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Top Channel</th>
                  <th>Health Signal / Life Event</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_CUSTOMER_DATA.map((row, index) => (
                  <tr key={index}>
                    <td>{row.email}</td>
                    <td>{row.name}</td>
                    <td><span className="badge badge-gray">{row.topChannel}</span></td>
                    <td className="text-gray-600 font-medium">{row.condition}</td>
                    <td>{row.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>


        </div>
      )}

      {step === 2 && (
        <div className="animate-fadeIn">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-2 text-subtext hover:text-[#0077C8] font-semibold mb-6 transition-colors"
          >
            <ArrowLeft size={20} /> Back to Data
          </button>

          {isLoading && loadingStep && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#0077C8] border-t-transparent mb-4"></div>
              <p className="text-lg font-medium text-gray-500 animate-pulse">{loadingStep}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {personas.map((p, i) => (
              <div key={i} className="content-card p-0 overflow-hidden flex flex-col hover:border-[#0077C8] transition-colors">
                {/* Header / Image */}
                <div className="relative h-72 bg-gray-100">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="img-cover-top" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50">
                      <div className="text-center">
                        <Users size={48} className="mx-auto mb-2 opacity-30" />
                        <span className="text-sm">Creating Portrait...</span>
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  <div className="absolute bottom-6 left-6 text-white">
                    <h3 className="font-bold text-2xl mb-1">{p.name}</h3>
                    <p className="text-gray-200 font-medium text-sm bg-white/20 backdrop-blur-sm px-2 py-1 rounded-md inline-block border border-white/10">
                      {p.details?.job_title || "Member Profile"}
                    </p>
                  </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 flex-1 bg-white">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <p className="text-subtext text-xs uppercase font-bold mb-1">Age Group</p>
                      <p className="font-semibold text-heading">{p.details?.age || p.demographics.split(',')[0] || "..."}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <p className="text-subtext text-xs uppercase font-bold mb-1">Income Tier</p>
                      <p className="font-semibold text-heading">{p.details?.income || "..."}</p>
                    </div>
                  </div>

                  {/* Bio */}
                  <div>
                    <h4 className="font-bold text-heading mb-2 flex items-center gap-2">
                      <Briefcase size={16} className="text-[#0077C8]" /> Lifestyle & Needs
                    </h4>
                    <p className="text-subtext text-sm leading-relaxed">
                      {p.details?.bio || p.bio}
                    </p>
                  </div>

                  {/* Preferred Products / Plans */}
                  {p.details?.preferred_products && (
                    <div>
                      <h4 className="font-bold text-heading mb-2 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <Shield size={14} className="text-green-600" /> Recommended Plans
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {p.details.preferred_products.map((product, idx) => (
                          <span key={idx} className="bg-green-50 text-green-700 text-xs px-3 py-1 rounded-full font-bold border border-green-100">
                            {product}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lifestyle Tags */}
                  {p.details && (
                    <div>
                      <div className="flex flex-wrap gap-2">
                        {p.details.lifestyle_tags.slice(0, 5).map((tag, idx) => (
                          <span key={idx} className="bg-blue-50 text-[#0077C8] text-xs px-3 py-1 rounded-full font-medium border border-blue-100">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Charts Section */}
                  {p.details?.charts?.brand_affinity && (
                    <div className="space-y-6 pt-6 border-t border-gray-100">
                      {/* Brand Affinity (Engagement) Chart */}
                      <div>
                        <h4 className="font-bold text-heading mb-3 flex items-center gap-2 text-sm">
                          <TrendingUp size={16} className="text-[#0077C8]" /> Engagement Score
                        </h4>
                        <div className="h-48 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={transformChartData(p.details.charts.brand_affinity)}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', backgroundColor: '#FFFFFF', color: '#111827' }}
                                itemStyle={{ fontSize: '12px', fontWeight: 'bold', color: '#0077C8' }}
                              />
                              <Line type="monotone" dataKey="value" stroke="#0077C8" strokeWidth={3} dot={{ r: 4, fill: '#0077C8' }} activeDot={{ r: 6 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
