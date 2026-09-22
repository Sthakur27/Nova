// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import SyncSettings from "./SyncSettings";
import { confirmCloudDeletion } from "./confirmCloudDeletion";
vi.mock("./platform", () => ({mobile:false}));
vi.mock("./confirmCloudDeletion", () => ({confirmCloudDeletion:vi.fn()}));
it("offers resolution only for missing files and requires confirmation before deleting", async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  const host=document.createElement("div"),root=createRoot(host);
  document.body.append(host);
  const resolveMissing=vi.fn(async()=>{});
  const missing={path:"deleted.txt",state:"error",message:"Missing",missingDriveId:"old-id"};
  const folder={root:"/notes",name:"Notes",files:[],cloudSpace:{id:"space",name:"Notes",account:"a"}};
  const props={folders:[folder],folder,onClose:vi.fn(),drive:{status:{connected:true,email:"user@example.com"}},uploads:{items:{"/notes\ndeleted.txt":missing,"/notes\nother.txt":{path:"other.txt",state:"error",message:"Offline"}},errors:{},completed:{},resolveMissing}} as unknown as ComponentProps<typeof SyncSettings>;
  const button=(label:string)=>[...host.querySelectorAll("button")].find(b=>b.textContent===label)!;
  try {
    await act(async()=>root.render(<SyncSettings {...props}/>));
    expect(host.querySelectorAll('[role="group"]')).toHaveLength(1);
    await act(async()=>button("Restore to Cloud").click());
    expect(resolveMissing).toHaveBeenCalledWith("/notes",missing,true);
    expect(confirmCloudDeletion).not.toHaveBeenCalled();
    resolveMissing.mockClear();
    vi.mocked(confirmCloudDeletion).mockResolvedValueOnce(false);
    await act(async()=>button("Acknowledge & delete…").click());
    expect(resolveMissing).not.toHaveBeenCalled();
    vi.mocked(confirmCloudDeletion).mockResolvedValueOnce(true);
    await act(async()=>button("Acknowledge & delete…").click());
    expect(confirmCloudDeletion).toHaveBeenCalledWith("deleted.txt");
    expect(resolveMissing).toHaveBeenCalledWith("/notes",missing,false);
    resolveMissing.mockRejectedValueOnce(new Error("Drive is offline"));
    await act(async()=>button("Restore to Cloud").click());
    expect(host.textContent).toContain("Drive is offline");
    await act(async()=>root.render(<SyncSettings {...props} cloudLoading/>));
    expect(button("Restore to Cloud").disabled).toBe(true);
    expect(button("Acknowledge & delete…").disabled).toBe(true);
  } finally { await act(async()=>root.unmount()); host.remove(); }
});
