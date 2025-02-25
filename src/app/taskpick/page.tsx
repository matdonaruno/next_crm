'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ThermometerSnowflake, Wrench, ChartLine, FlaskRound } from 'lucide-react';
import { Card } from '@/components/ui/card';

const menuItems = [
  {
    title: 'Temperature Records',
    description: 'Monitor and record temperature data',
    icon: ThermometerSnowflake,
    path: '/temperature',
    color: 'bg-dashboard-pink',
  },
  {
    title: 'Equipment Maintenance',
    description: 'Track and log maintenance tasks',
    icon: Wrench,
    path: '/equipment',
    color: 'bg-dashboard-purple',
  },
  {
    title: 'Quality Control',
    description: 'Manage quality control processes',
    icon: ChartLine,
    path: '/quality',
    color: 'bg-dashboard-pink',
  },
  {
    title: 'Reagent Management',
    description: 'Track reagent inventory and usage',
    icon: FlaskRound,
    path: '/reagent_dash',
    color: 'bg-dashboard-purple',
  },
];

export default function TaskPick() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || 'Department';
  const departmentId = searchParams?.get('departmentId') || '';

  const handleCardClick = (path: string) => {
    router.push(
      `${path}?department=${encodeURIComponent(departmentName)}&departmentId=${departmentId}`
    );
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-b from-[#fde3f1] to-[#e9ddfc] py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="titlefont text-4xl font-bold mb-4" style={{ color: '#8167a9' }}>
            Labo Logbook <span style={{ color: '#ffffff', textShadow: '-1px -1px 0 #666, 1px -1px 0 #666, -1px 1px 0 #666, 1px 1px 0 #666' }}>Dashboard</span>
          </h1>
          <h2 className="cutefont text-3xl  mb-4"style={{ color: '#8167a9' }}>
            『{departmentName}』
          </h2>
          <p className="titlefont text-lg "style={{ color: '#8167a9' }}>
            Select a category to manage your records
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {menuItems.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleCardClick(item.path)}
              className="cursor-pointer"
            >
              <Card
                className={`relative overflow-hidden group cursor-pointer transition-all duration-300 hover:shadow-lg ${item.color} hover:bg-dashboard-hover`}
              >
                {/* --- SVG を挿入する部分 --- */}
                <div className="absolute left-0 w-full pointer-events-none z-0 top-auto bottom-0 h-15">
                  <svg
                    className="waves w-full h-auto"
                    xmlns="http://www.w3.org/2000/svg"
                    xmlnsXlink="http://www.w3.org/1999/xlink"
                    viewBox="0 24 150 28"
                    preserveAspectRatio="none"
                    shapeRendering="auto"
                  >
                    <defs>
                      <path
                        id="gentle-wave"
                        d="M-160 44c30 0 58-18 88-18s58 18 88 18
                           58-18 88-18 58 18 88 18 v44h-352z"
                      />
                    </defs>
                    <g className="parallax">
                      <use
                        xlinkHref="#gentle-wave"
                        x="48"
                        y="0"
                        fill="rgba(255,255,255,0.7)"
                      />
                      <use
                        xlinkHref="#gentle-wave"
                        x="48"
                        y="3"
                        fill="rgba(255,255,255,0.5)"
                      />
                      <use
                        xlinkHref="#gentle-wave"
                        x="48"
                        y="5"
                        fill="rgba(255,255,255,0.3)"
                      />
                      <use
                        xlinkHref="#gentle-wave"
                        x="48"
                        y="7"
                        fill="#fff"
                      />
                    </g>
                  </svg>
                </div>
                {/* --- /SVG --- */}

                <div className="p-6 flex flex-col items-center text-center gap-4 relative z-10">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <item.icon className="w-6 h-6 text-[#8167a9] group-hover:text-pink-500 transition-colors duration-300" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#8167a9] mb-2 group-hover:text-pink-600 transition-colors duration-300">
                      {item.title}
                    </h3>
                    <p className="text-sm text-[#8167a9] group-hover:text-gray-900 transition-colors duration-300">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
