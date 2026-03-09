import React, { useState } from 'react';
import { PDPEnrichment } from './PDPEnrichment';
import { MultiImage } from './MultiImage';
import { PDPPersonalization } from './PDPPersonalization';
import { ESpots } from './ESpots';
import { ContentVersioning } from './ContentVersioning';
import { GenSiteStub } from './GenSiteStub';
import { ImagePlus, Heart, Sparkles, Target, Tag, Globe, Video } from 'lucide-react';


export const PDPHub: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'PERSONALIZATION' | 'ENRICHMENT' | 'ESPOTS' | 'CONTENT_VERSIONING' | 'GENSITE' | 'MULTI_IMAGE'>('PERSONALIZATION');

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Top Bar */}
            <div className="page-header">
                <div className="max-w-[1600px] mx-auto px-6 w-full">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <Sparkles className="text-blue-600" size={24} />
                            <h1 className="page-title text-gray-900">Product Experience Hub</h1>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="tab-scroll-container">
                        <button
                            onClick={() => setActiveTab('PERSONALIZATION')}
                            className={`tab-button ${activeTab === 'PERSONALIZATION' ? 'active' : 'inactive'}`}
                        >
                            <Heart size={18} /> PDP Personalization
                        </button>
                        <button
                            onClick={() => setActiveTab('ESPOTS')}
                            className={`tab-button ${activeTab === 'ESPOTS' ? 'active' : 'inactive'}`}
                        >
                            <Target size={18} /> Banner Creation
                        </button>
                        <button
                            onClick={() => setActiveTab('GENSITE')}
                            className={`tab-button ${activeTab === 'GENSITE' ? 'active' : 'inactive'}`}
                        >
                            <Globe size={18} /> Gen Site
                        </button>
                        <button
                            onClick={() => setActiveTab('MULTI_IMAGE')}
                            className={`tab-button ${activeTab === 'MULTI_IMAGE' ? 'active' : 'inactive'}`}
                        >
                            <ImagePlus size={18} /> Multi-Image
                        </button>
                        <button
                            onClick={() => setActiveTab('CONTENT_VERSIONING')}
                            className={`tab-button ${activeTab === 'CONTENT_VERSIONING' ? 'active' : 'inactive'}`}
                        >
                            <Tag size={18} /> Content Versions
                        </button>

                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 bg-gray-50">
                <div className="max-w-[1600px] mx-auto">
                    {activeTab === 'MULTI_IMAGE' && <MultiImage />}
                    {activeTab === 'PERSONALIZATION' && <PDPPersonalization />}
                    {activeTab === 'ESPOTS' && <ESpots />}
                    {activeTab === 'GENSITE' && <GenSiteStub />}
                    {activeTab === 'ENRICHMENT' && <PDPEnrichment />}
                    {activeTab === 'CONTENT_VERSIONING' && <ContentVersioning />}

                </div>
            </div>
        </div>
    );
};
