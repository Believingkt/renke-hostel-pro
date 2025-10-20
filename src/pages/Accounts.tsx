import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Accounts = () => {
  const owners = [
    {
      name: "森山寧照",
      email: "sensan.inn@gmail.com",
      lastLogin: "2025-10-20 08:37",
    },
  ];

  const operators = [
    {
      name: "yushiuan0315",
      email: "yushiuan0315@gmail.com",
      lastLogin: "2025-06-20 09:44",
    },
    {
      name: "nokimi",
      email: "nokimi@gmail.com",
      lastLogin: "2025-10-15 09:14",
    },
    {
      name: "DOFI",
      email: "dofilab@gmail.com",
      lastLogin: "2025-10-18 10:41",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">帳號權限管理</h1>

      <Accordion type="multiple" defaultValue={["owner", "operator"]} className="w-full">
        <AccordionItem value="owner">
          <AccordionTrigger className="text-lg font-semibold">
            擁有者
          </AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>帳號</TableHead>
                  <TableHead>最後登入日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owners.map((user, index) => (
                  <TableRow key={index}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.lastLogin}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="operator">
          <AccordionTrigger className="text-lg font-semibold">
            現場營運
          </AccordionTrigger>
          <AccordionContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名稱</TableHead>
                  <TableHead>帳號</TableHead>
                  <TableHead>最後登入日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operators.map((user, index) => (
                  <TableRow key={index}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.lastLogin}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default Accounts;
