import Workspace from '../workspace';
import {ROLE_IDS,Role,deskOf} from '../team';
import {demoMultiMember} from '../demo-team';
import Security from '../account/security/security';
import DeskSelector from '../workspaces/selector';
import {redirect} from 'next/navigation';
export default async function Demo({searchParams}:{searchParams:Promise<{role?:string;view?:string;account?:string}>}){const query=await searchParams;if(query.view==='onboarding')return <Security demo member={{...demoMultiMember,mustChangePassword:true,profileCompleted:false}}/>;if(query.view==='workspaces')return <DeskSelector demo member={demoMultiMember}/>;const role=ROLE_IDS.includes(query.role as Role)?deskOf(query.role as Role):'management';if(query.account==='multi'&&!demoMultiMember.assignedDesks?.includes(role))redirect('/demo?role=sales&account=multi');return <Workspace demoEnabled portalRole={role} demoAccount={query.account==='multi'}/>;}
