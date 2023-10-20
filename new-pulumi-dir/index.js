import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import yaml from "js-yaml";
import * as fs from "fs";

const stack = pulumi.getStack();
const configFile = fs.readFileSync(`Pulumi.${stack}.yaml`, 'utf8');
const config = yaml.safeLoad(configFile);

// Creating VPC
const myvpc = new aws.ec2.Vpc(config.config['iac-pulumi:vpc_name'], {
    cidrBlock: config.config['iac-pulumi:vpc_cidrBlock'],
    tags: {
        Name: config.config['iac-pulumi:vpc_name'],
    },
});

// Creating subnet 

// Create public subnets
const iam_publicSubnets = [];
const iam_privateSubnets = [];
const available = aws.getAvailabilityZones({
    state: "available",
});

available.then(available => {
    
    const zoneCount = Math.min((available.names?.length || 0),parseInt(config.config['iac-pulumi:no_of_max_subnets']));
    const arr = config.config['iac-pulumi:sub_cidr'].split(".");
    for (let i = 0; i < zoneCount; i++) {
        // Create public subnets
        
        const subpubName = config.config['iac-pulumi:public_subnet_name'] + i;
        console.log(subpubName)
        const subpubCidr = arr[0] + "." + arr[1] + "." + i + "." + arr[3];
        const publicsubnet = new aws.ec2.Subnet(subpubName, {
            vpcId: myvpc.id,
            availabilityZone: available.names?.[i],
            cidrBlock: subpubCidr,
            mapPublicIpOnLaunch: true,
            tags: {
                Name: subpubName,
            },
        });

        iam_publicSubnets.push(publicsubnet);

        const host = i + zoneCount
        // Create private subnets
        const subpriCidr = arr[0] + "." + arr[1] + "." + host + "." + arr[3];
        const subPrivateName = config.config['iac-pulumi:private_subnet_name'] + i;
        const privatesubnet = new aws.ec2.Subnet(subPrivateName, {
            vpcId: myvpc.id,
            availabilityZone: available.names?.[i],
            cidrBlock: subpriCidr,
            tags: {
                Name: subPrivateName,
            },
        });

        iam_privateSubnets.push(privatesubnet);
    }

    // Creating internet gateway
    const internet = new aws.ec2.InternetGateway(config.config['iac-pulumi:internet_gateway_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:internet_gateway_name'],
        },
    });

    // Create a public route table
    const publicRouteTable = new aws.ec2.RouteTable(config.config['iac-pulumi:public_route_table_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:public_route_table_name'],
        },
    });

    // Attach all public subnets to the public route table
    iam_publicSubnets.forEach((subnet, index) => {
        let pubAssociationNmae = config.config['iac-pulumi:public_association_name'] + index
        const routeTable = new aws.ec2.RouteTableAssociation(pubAssociationNmae, {
            routeTableId: publicRouteTable.id,
            subnetId: subnet.id,
        });
    });

    // Create a private route table
    const privRouteTable = new aws.ec2.RouteTable(config.config['iac-pulumi:private_route_table_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:private_route_table_name'],
        },
    });

    // Attach all private subnets to the private route table
    iam_privateSubnets.forEach((subnet, index) => {
        let priAssociationNmae = config.config['iac-pulumi:private_association_name'] + index
        const routeTable = new aws.ec2.RouteTableAssociation(priAssociationNmae, {
            routeTableId: privRouteTable.id,
            subnetId: subnet.id,
        });
    });

    const publicRoute = new aws.ec2.Route(config.config['iac-pulumi:public_route_name'], {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: config.config['iac-pulumi:route_to_internet'],
        gatewayId: internet.id,
        tags: {
            Name: config.config['iac-pulumi:public_route_name'],
        },
    });

    // Create an EC2 security group for web applications
    const appSecurityGroup = new aws.ec2.SecurityGroup(config.config['iac-pulumi:security_group_name'], {
    vpcId: myvpc.id,
    description: "Security group for web applications",
    ingress: [
      {
        fromPort: config.config['iac-pulumi:ssh_from_port'], //SSH
        toPort: config.config['iac-pulumi:ssh_to_port'],
        protocol: config.config['iac-pulumi:protocol'],
        cidrBlocks: [config.config['iac-pulumi:ssh_ip']], 
      },
      {
        fromPort: config.config['iac-pulumi:http_from_port'], //HTTP
        toPort: config.config['iac-pulumi:http_to_port'],
        protocol: config.config['iac-pulumi:protocol'],
        cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
        ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']], 
      },
      {
        fromPort: config.config['iac-pulumi:https_from_port'], //HTTPS
        toPort: config.config['iac-pulumi:https_to_port'],
        protocol: config.config['iac-pulumi:protocol'],
        cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
        ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']], 
      },
      {
        fromPort: config.config['iac-pulumi:your_from_port'], //your port
        toPort: config.config['iac-pulumi:your_to_port'],
        protocol: config.config['iac-pulumi:protocol'],
        cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
        ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']], 
      },
    ],
    tags: {
        Name: config.config['iac-pulumi:security_group_name'],
    },
  });

  const ami = aws.ec2.getAmi({
    filters: [
        {
            name: config.config['iac-pulumi:ami_name'],
            values: [config.config['iac-pulumi:ami_name_value']],
        },
        {
            name: config.config['iac-pulumi:root_device_type_tag'],
            values: [config.config['iac-pulumi:root_device_type_tag_value']],
        },
        {
            name: config.config['iac-pulumi:virtualization_tag'],
            values: [config.config['iac-pulumi:virtualization_tag_value']],
        },
    ],
    mostRecent: true,
    owners: [config.config['iac-pulumi:owner']],
});

const instance = new aws.ec2.Instance(config.config['iac-pulumi:instance_tag'], {
    ami: ami.then(i => i.id),
    instanceType: config.config['iac-pulumi:instance_type'],
    subnetId: iam_publicSubnets[0],
    keyName: config.config['iac-pulumi:key_value'],
    associatePublicIpAddress: true,
    vpcSecurityGroupIds: [
        appSecurityGroup.id,
    ]
});

});