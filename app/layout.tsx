import type { Metadata } from 'next';
import './ui-tokens.css';
import './globals.css';
import './workspace-ui.css';
import './business.css';
export const metadata:Metadata={title:'固实能源 · 项目协作台',description:'按销售阶段推进项目，统筹部门分工、厂家报备、交接反馈和售后复盘。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>}
